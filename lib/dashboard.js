// Cuentas del tablero del tesorero. Solo cuentan pagos aprobados, por mes de pago (paid_at).
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ym = d => (d ? String(d).slice(0, 7) : '');
const approved = p => p.status === 'aprobado';

export function lastMonths(month, n) {
  let [y, m] = month.split('-').map(Number);
  const out = [];
  for (let i = 0; i < n; i++) { out.unshift(`${y}-${String(m).padStart(2, '0')}`); m--; if (m === 0) { m = 12; y--; } }
  return out;
}

export function monthlyIncome(payments, months) {
  return months.map(month => {
    const row = { month, cuota: 0, producto: 0, torneo: 0, total: 0 };
    for (const p of payments) {
      if (approved(p) && ym(p.paid_at) === month && p.concept in row) { row[p.concept] += p.amount_cents; row.total += p.amount_cents; }
    }
    return row;
  });
}

export function debtors(players, payments, month) {
  const ok = new Set(payments.filter(p => approved(p) && p.concept === 'cuota' && ym(p.paid_at) === month).map(p => p.player_id));
  return players.filter(p => p.active !== false && !ok.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function kpis(players, payments, month) {
  const active = players.filter(p => p.active !== false);
  const alDia = active.length - debtors(players, payments, month).length;
  const [prev, cur] = monthlyIncome(payments, lastMonths(month, 2));
  return {
    total: active.length, alDia, pct: active.length ? Math.round((alDia / active.length) * 100) : 0,
    ingresos: cur.total, ingresosPrev: prev.total,
    deltaPct: prev.total > 0 ? Math.round(((cur.total - prev.total) / prev.total) * 100) : null,
    pendientes: payments.filter(p => p.status === 'pendiente').length,
  };
}

export function waReminder(player, month, club) {
  const mes = MESES[Number(month.slice(5, 7)) - 1];
  const text = `Hola ${player.name.split(' ')[0]}! Te escribimos de ${club}: figura pendiente la cuota de ${mes}. Si ya la pagaste, informala en la app. Gracias!`;
  return 'https://wa.me/?text=' + encodeURIComponent(text);
}
