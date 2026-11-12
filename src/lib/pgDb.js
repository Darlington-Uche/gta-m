// Firestore-shaped document store on top of ONE Postgres table (gta.docs: path, col, id, data jsonb, v).
// Same interface as memoryDb.js, so the whole backend runs unchanged on Supabase Postgres.
// Transactions are optimistic like Firestore's: reads remember each doc's version, the commit re-checks them inside one
// SQL transaction (with advisory locks per path) and the callback is retried if anything changed.
const clone = (v) => (v === undefined ? v : structuredClone(v));
const isInc = (v) => v && typeof v === 'object' && '__inc' in v;
const strip = (o) => {
  if (Array.isArray(o)) return o.map(strip);
  if (o && typeof o === 'object') { const r = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = strip(v); return r; }
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
const nest = (field, value) => field.split('.').reduceRight((acc, k) => ({ [k]: acc }), value);
const mergeDeep = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? mergeDeep(a[k], v) : v; return a; };
const asRec = (r) => (r ? { data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data, v: Number(r.v) } : undefined);

class Snap {
  constructor(ref, rec) { this.ref = ref; this.id = ref.id; this.exists = !!rec; this._rec = rec; }
  data() { return this._rec ? clone(this._rec.data) : undefined; }
}

class DocRef {
  constructor(db, colName, id) { this._db = db; this.colName = colName; this.id = id; this.path = `${colName}/${id}`; }
  async get() { return new Snap(this, await this._db._read(this.path)); }
  async set(data, opts) { await this._db._commit([], [['set', this.path, data, opts]]); }
  async update(data) { await this._db._commit([], [['update', this.path, data]]); }
  async delete() { await this._db._commit([], [['delete', this.path]]); }
}

class Query {
  constructor(db, colName, filters = [], order = null, lim = null) { this._db = db; this.colName = colName; this._filters = filters; this._order = order; this._lim = lim; }
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
    // equality filters are pushed into Postgres (jsonb containment); everything else is checked in JS
    const eq = this._filters.filter((f) => f.op === '==' && f.value !== undefined);
    const contain = eq.reduce((acc, f) => mergeDeep(acc, nest(f.field, f.value)), {});
    const rows = await this._db._q('select id, data, v from gta.docs where col = $1 and data @> $2::jsonb', [this.colName, JSON.stringify(contain)]);
    let docs = rows.map((r) => ({ ref: new DocRef(this._db, this.colName, r.id), rec: asRec(r) })).filter((d) => this._match(d.rec.data));
    docs = docs.map((d) => new Snap(d.ref, d.rec));
    if (this._order) {
      const { field, dir } = this._order;
      docs.sort((a, b) => { const x = getField(a._rec.data, field), y = getField(b._rec.data, field); return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1); });
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
      const rec = await this._db._read(target.path);
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

/** runner = { query(text, params) -> rows[], tx(fn(q)) } — supplied by the host (postgres.js on Supabase, PGlite in tests). */
export class PgFirestore {
  constructor(runner) { this._r = runner; }
  _q(text, params) { return this._r.query(text, params); }
  collection(name) { return new ColRef(this, name); }
  async _read(path) { const rows = await this._q('select data, v from gta.docs where path = $1', [path]); return asRec(rows[0]); }
  /** One SQL transaction: lock every touched path, verify read versions, apply writes. Returns false if a read went stale. */
  async _commit(reads, writes) {
    const paths = [...new Set([...reads.map(([p]) => p), ...writes.map((w) => w[1])])].sort();
    return this._r.tx(async (q) => {
      for (const p of paths) await q('select pg_advisory_xact_lock(hashtextextended($1, 0))', [p]);
      for (const [p, v] of reads) {
        const r = await q('select v from gta.docs where path = $1', [p]);
        if ((r[0] ? Number(r[0].v) : 0) !== v) return false;
      }
      for (const [kind, path, data, opts] of writes) {
        const [colName, ...rest] = path.split('/'); const id = rest.join('/');
        if (kind === 'delete') { await q('delete from gta.docs where path = $1', [path]); continue; }
        const cur = asRec((await q('select data, v from gta.docs where path = $1', [path]))[0]);
        let next;
        if (kind === 'update') { if (!cur) throw new Error(`NOT_FOUND: cannot update missing doc ${path}`); next = applyUpdate(cur.data, strip(data)); }
        else {
          if (kind === 'create' && cur) throw new Error(`ALREADY_EXISTS: ${path}`);
          next = opts && opts.merge && cur ? applyUpdate(cur.data, strip(data)) : applyUpdate({}, strip(data));
        }
        await q(`insert into gta.docs (path, col, id, data, v) values ($1, $2, $3, $4::jsonb, 1)
                 on conflict (path) do update set data = excluded.data, v = gta.docs.v + 1, updated_at = now()`, [path, colName, id, JSON.stringify(next)]);
      }
      return true;
    });
  }
  async runTransaction(fn) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const tx = new Tx(this);
      const result = await fn(tx);
      if (await this._commit([...tx.reads], tx.writes)) return result;
    }
    throw new Error('pgDb: transaction contention');
  }
  batch() {
    const ops = [];
    return {
      set: (ref, d, o) => ops.push(['set', ref.path, d, o]),
      update: (ref, d) => ops.push(['update', ref.path, d]),
      delete: (ref) => ops.push(['delete', ref.path]),
      commit: async () => { await this._commit([], ops); }
    };
  }
}

export const pgInc = (n) => ({ __inc: n });
