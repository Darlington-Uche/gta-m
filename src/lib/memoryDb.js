// Tiny in-memory stand-in for the parts of Firestore this project uses.
// Only for tests / offline demos (DB_DRIVER=memory). Mirrors transaction retry semantics.

const clone = (v) => (v === undefined ? v : structuredClone(v));
const isInc = (v) => v && typeof v === 'object' && '__inc' in v;
const strip = (o) => {
  if (Array.isArray(o)) return o.map(strip);
  if (o && typeof o === 'object') {
    const r = {};
    for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = strip(v);
    return r;
  }
  return o;
};
const getField = (obj, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), obj);

function applyUpdate(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (isInc(v)) out[k] = (typeof out[k] === 'number' ? out[k] : 0) + v.__inc;
    else out[k] = clone(v);
  }
  return out;
}

class Snap {
  constructor(ref, rec) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = !!rec;
    this._rec = rec;
  }
  data() { return this._rec ? clone(this._rec.data) : undefined; }
}

class DocRef {
  constructor(db, colName, id) {
    this._db = db; this.colName = colName; this.id = id; this.path = `${colName}/${id}`;
  }
  async get() { return new Snap(this, this._db._store.get(this.path)); }
  async set(data, opts) { this._db._write(this.path, 'set', data, opts); }
  async update(data) { this._db._write(this.path, 'update', data); }
  async delete() { this._db._write(this.path, 'delete'); }
}

class Query {
  constructor(db, colName, filters = [], order = null, lim = null) {
    this._db = db; this.colName = colName; this._filters = filters; this._order = order; this._lim = lim;
  }
  where(field, op, value) { return new Query(this._db, this.colName, [...this._filters, { field, op, value }], this._order, this._lim); }
  orderBy(field, dir = 'asc') { return new Query(this._db, this.colName, this._filters, { field, dir }, this._lim); }
  limit(n) { return new Query(this._db, this.colName, this._filters, this._order, n); }
  _match(data) {
    return this._filters.every(({ field, op, value }) => {
      const v = getField(data, field);
      switch (op) {
        case '==': return v === value;
        case '!=': return v !== value;
        case '<': return v < value;
        case '<=': return v <= value;
        case '>': return v > value;
        case '>=': return v >= value;
        case 'in': return value.includes(v);
        case 'array-contains': return Array.isArray(v) && v.includes(value);
        default: throw new Error('unsupported op ' + op);
      }
    });
  }
  async get() {
    let docs = [];
    const prefix = this.colName + '/';
    for (const [path, rec] of this._db._store) {
      if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/')) continue;
      if (this._match(rec.data)) docs.push(new Snap(new DocRef(this._db, this.colName, path.slice(prefix.length)), rec));
    }
    if (this._order) {
      const { field, dir } = this._order;
      docs.sort((a, b) => {
        const x = getField(a._rec.data, field), y = getField(b._rec.data, field);
        return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1);
      });
    }
    if (this._lim != null) docs = docs.slice(0, this._lim);
    return { docs, empty: docs.length === 0, size: docs.length, forEach: (f) => docs.forEach(f) };
  }
}

class ColRef extends Query {
  constructor(db, name) { super(db, name); }
  doc(id) { return new DocRef(this._db, this.colName, id || 'auto_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36)); }
  async add(data) { const ref = this.doc(); await ref.set(data); return ref; }
}

class Tx {
  constructor(db) { this._db = db; this.reads = new Map(); this.writes = []; }
  async get(target) {
    if (target instanceof DocRef) {
      const rec = this._db._store.get(target.path);
      this.reads.set(target.path, rec ? rec.v : 0);
      return new Snap(target, rec);
    }
    const res = await target.get();
    res.docs.forEach((d) => this.reads.set(d.ref.path, d._rec.v));
    return res;
  }
  set(ref, data, opts) { this.writes.push(['set', ref.path, data, opts]); return this; }
  update(ref, data) { this.writes.push(['update', ref.path, data]); return this; }
  create(ref, data) { this.writes.push(['create', ref.path, data]); return this; }
  delete(ref) { this.writes.push(['delete', ref.path]); return this; }
}

export class MemoryFirestore {
  constructor() { this._store = new Map(); }
  collection(name) { return new ColRef(this, name); }
  _write(path, kind, data, opts) {
    const cur = this._store.get(path);
    if (kind === 'delete') { this._store.delete(path); return; }
    if (kind === 'update') {
      if (!cur) throw new Error(`NOT_FOUND: cannot update missing doc ${path}`);
      this._store.set(path, { data: applyUpdate(cur.data, strip(data)), v: cur.v + 1 });
      return;
    }
    if (kind === 'create') {
      if (cur) throw new Error(`ALREADY_EXISTS: ${path}`);
    }
    const next = opts && opts.merge && cur ? applyUpdate(cur.data, strip(data)) : applyUpdate({}, strip(data));
    this._store.set(path, { data: next, v: (cur ? cur.v : 0) + 1 });
  }
  async runTransaction(fn) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const tx = new Tx(this);
      const result = await fn(tx);
      let stale = false;
      for (const [path, v] of tx.reads) {
        const rec = this._store.get(path);
        if ((rec ? rec.v : 0) !== v) { stale = true; break; }
      }
      if (stale) continue;
      for (const [kind, path, data, opts] of tx.writes) this._write(path, kind, data, opts);
      return result;
    }
    throw new Error('memoryDb: transaction contention');
  }
  batch() {
    const ops = [];
    return {
      set: (ref, d, o) => ops.push(['set', ref.path, d, o]),
      update: (ref, d) => ops.push(['update', ref.path, d]),
      delete: (ref) => ops.push(['delete', ref.path]),
      commit: async () => ops.forEach(([k, p, d, o]) => this._write(p, k, d, o))
    };
  }
}

export const memInc = (n) => ({ __inc: n });
