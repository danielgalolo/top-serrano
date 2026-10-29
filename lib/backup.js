// Copia de seguridad legible (JSON) y planilla para el tesorero (CSV).
export const REQUIRED = ['clubs', 'players', 'matches', 'payments'];

export function exportBackup(tables, { club, now = new Date().toISOString() } = {}) {
  return JSON.stringify({ version: 1, meta: { club, exported_at: now }, tables }, null, 2);
}

export function validateBackup(text) {
  let o;
  try { o = JSON.parse(text); } catch { return { ok: false, error: 'No es un JSON válido' }; }
  if (!o || o.version !== 1 || typeof o.tables !== 'object' || !o.tables) return { ok: false, error: 'Formato de copia desconocido' };
  for (const t of REQUIRED) {
    if (!Array.isArray(o.tables[t])) return { ok: false, error: `Falta la tabla ${t}` };
  }
  return { ok: true, meta: o.meta, tables: o.tables };
}

export function toCsv(rows, columns) {
  const esc = v => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [columns.join(','), ...rows.map(r => columns.map(c => esc(r[c])).join(','))].join('\n');
}
