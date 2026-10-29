import { expected } from './elo.js';

export function h2h(matches, a, b) {
  const games = matches
    .filter(m => (m.a_id === a && m.b_id === b) || (m.a_id === b && m.b_id === a))
    .filter(m => m.sets_a !== m.sets_b)
    .map(m => {
      const aIsA = m.a_id === a;
      const sa = aIsA ? m.sets_a : m.sets_b, sb = aIsA ? m.sets_b : m.sets_a;
      const parciales = m.set_scores?.map(([x, y]) => (aIsA ? [x, y] : [y, x]));
      return { played_at: m.played_at, sets: `${sa}-${sb}`, a_won: sa > sb, ...(parciales && { parciales }) };
    })
    .sort((x, y) => new Date(y.played_at) - new Date(x.played_at));
  const wa = games.filter(g => g.a_won).length;
  const pts = games.flatMap(g => g.parciales ?? []);
  const pf = pts.reduce((t, [x]) => t + x, 0), pc = pts.reduce((t, [, y]) => t + y, 0);
  return { wa, wb: games.length - wa, total: games.length, pf, pc, last: games.slice(0, 5) };
}

// 70% ELO + 30% historial, acotado entre 10 y 90. Sin historial usa solo el ELO.
export function winProbability(eloA, eloB, hist) {
  const byElo = expected(eloA, eloB);
  const p = hist.total > 0 ? byElo * 0.7 + (hist.wa / hist.total) * 0.3 : byElo;
  return Math.min(90, Math.max(10, Math.round(p * 100)));
}
