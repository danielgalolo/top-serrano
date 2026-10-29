// Posiciones por ELO. Empate de puntaje: orden alfabético.
export function rank(players, { category, damas } = {}) {
  return players
    .filter(p => p.active !== false)
    .filter(p => (category ? p.category === category : true))
    .filter(p => (damas ? p.female : true))
    .sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name, 'es'));
}

export function gapToNext(ranked, id) {
  const i = ranked.findIndex(p => p.id === id);
  if (i < 0) return null;
  const me = ranked[i], up = ranked[i - 1], down = ranked[i + 1];
  return {
    position: i + 1,
    up: up ? { id: up.id, gap: up.elo - me.elo } : null,
    down: down ? { id: down.id, gap: me.elo - down.elo } : null,
  };
}
