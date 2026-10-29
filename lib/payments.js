// Reglas de pagos del club.
const ACTIVE = s => s !== 'rechazado';

export function findDuplicate(np, existing) {
  const cands = existing.filter(p => p.club_id === np.club_id && ACTIVE(p.status));
  if (np.operation_ref) return cands.find(p => p.operation_ref === np.operation_ref) ?? null;
  const day = d => (d ? String(d).slice(0, 10) : null);
  return cands.find(p => !p.operation_ref && p.player_id === np.player_id
    && p.amount_cents === np.amount_cents && day(p.paid_at) === day(np.paid_at)) ?? null;
}

// month: 'YYYY-MM'. Cuenta solo jugadores activos con una cuota aprobada en ese mes.
export function upToDate(players, payments, month) {
  const active = players.filter(p => p.active !== false);
  const ok = new Set(payments
    .filter(p => p.concept === 'cuota' && p.status === 'aprobado' && String(p.paid_at).startsWith(month))
    .map(p => p.player_id));
  const alDia = active.filter(p => ok.has(p.id)).length;
  return { total: active.length, alDia, pct: active.length ? Math.round((alDia / active.length) * 100) : 0 };
}

export function validateReceipt(r) {
  const problems = [];
  if (!(r.amount_cents > 0)) problems.push('monto');
  if (!r.paid_at) problems.push('fecha');
  if (!r.payer || !String(r.payer).trim()) problems.push('pagador');
  return { ok: problems.length === 0, problems };
}
