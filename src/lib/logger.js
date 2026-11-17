const stamp = () => new Date().toISOString();
const fmt = (lvl, msg, extra) => `${stamp()} ${lvl} ${msg}${extra === undefined ? '' : ' ' + (extra instanceof Error ? extra.stack : JSON.stringify(extra))}`;
export const log = {
  info: (m, x) => console.log(fmt('INFO ', m, x)),
  warn: (m, x) => console.warn(fmt('WARN ', m, x)),
  error: (m, x) => console.error(fmt('ERROR', m, x)),
  debug: (m, x) => process.env.DEBUG && console.log(fmt('DEBUG', m, x))
};
