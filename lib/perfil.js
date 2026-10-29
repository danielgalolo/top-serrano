import { START, update } from './elo.js';

const orden = ms => [...ms].sort((x, y) => new Date(x.played_at) - new Date(y.played_at));

// Cómo fue cambiando el ELO de un jugador. Primer punto: 1500 sin fecha. Un punto por partido jugado.
export function eloHistory(id, players, matches) {
  const elo = Object.fromEntries(players.map(p => [p.id, START]));
  const h = [{ date: null, elo: START }];
  for (const m of orden(matches)) {
    if (m.sets_a === m.sets_b || !(m.a_id in elo) || !(m.b_id in elo)) continue;
    const aWon = m.sets_a > m.sets_b, antes = { a: elo[m.a_id], b: elo[m.b_id] };
    [elo[m.a_id], elo[m.b_id]] = update(antes.a, antes.b, aWon ? 1 : 0);
    if (m.a_id !== id && m.b_id !== id) continue;
    const soyA = m.a_id === id;
    const mine = soyA ? m.sets_a : m.sets_b, theirs = soyA ? m.sets_b : m.sets_a;
    h.push({ date: m.played_at, elo: elo[id], delta: soyA ? elo[m.a_id] - antes.a : elo[m.b_id] - antes.b,
      rival: soyA ? m.b_id : m.a_id, rivalElo: soyA ? antes.b : antes.a, won: mine > theirs, sets: `${mine}-${theirs}` });
  }
  return h;
}

export function playerStats(id, matches) {
  const s = { played: 0, wins: 0, losses: 0, winPct: 0, setsFor: 0, setsAgainst: 0, pf: 0, pc: 0, streak: 0, bestStreak: 0 };
  for (const m of orden(matches)) {
    if (m.sets_a === m.sets_b || (m.a_id !== id && m.b_id !== id)) continue;
    const soyA = m.a_id === id, mine = soyA ? m.sets_a : m.sets_b, theirs = soyA ? m.sets_b : m.sets_a, won = mine > theirs;
    s.played++; s.setsFor += mine; s.setsAgainst += theirs;
    for (const [a, b] of m.set_scores ?? []) { s.pf += soyA ? a : b; s.pc += soyA ? b : a; }
    if (won) { s.wins++; s.streak = Math.max(s.streak, 0) + 1; } else { s.losses++; s.streak = Math.min(s.streak, 0) - 1; }
    s.bestStreak = Math.max(s.bestStreak, s.streak);
  }
  s.winPct = s.played ? Math.round((s.wins / s.played) * 100) : 0;
  return s;
}
