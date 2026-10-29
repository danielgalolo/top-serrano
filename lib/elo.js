// ELO local del club. Suma cero: lo que sube uno lo baja el otro.
export const START = 1500;
export const K = 32;

export function expected(ra, rb) {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

// scoreA: 1 si ganó A, 0 si perdió. Devuelve [nuevoA, nuevoB].
export function update(ra, rb, scoreA, k = K) {
  const delta = Math.round(k * (scoreA - expected(ra, rb)));
  return [ra + delta, rb - delta];
}

// Recalcula todo en orden de fecha. players: [{id, elo?}], matches: [{a_id,b_id,sets_a,sets_b,played_at}]
export function applyMatches(players, matches) {
  const s = {};
  for (const p of players) s[p.id] = { elo: START, played: 0, wins: 0, streak: 0 };
  const ordered = [...matches].sort((x, y) => new Date(x.played_at) - new Date(y.played_at));
  for (const m of ordered) {
    const a = s[m.a_id], b = s[m.b_id];
    if (!a || !b || m.sets_a === m.sets_b) continue;
    const aWon = m.sets_a > m.sets_b;
    [a.elo, b.elo] = update(a.elo, b.elo, aWon ? 1 : 0);
    a.played++; b.played++;
    if (aWon) { a.wins++; b.streak = Math.min(b.streak, 0) - 1; a.streak = Math.max(a.streak, 0) + 1; }
    else { b.wins++; a.streak = Math.min(a.streak, 0) - 1; b.streak = Math.max(b.streak, 0) + 1; }
  }
  return s;
}
