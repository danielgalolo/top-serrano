// Reglas ITTF: set a 11 puntos con diferencia de 2 (alargue sin tope).
export function validateSet(a, b) {
  if (![a, b].every(n => Number.isInteger(n) && n >= 0)) return { ok: false, error: 'Puntos inválidos' };
  const hi = Math.max(a, b), lo = Math.min(a, b);
  if (hi < 11) return { ok: false, error: 'Nadie llegó a 11' };
  if (hi === 11 && lo <= 9) return { ok: true };
  if (hi >= 12 && hi - lo === 2) return { ok: true };
  return { ok: false, error: hi === 11 ? 'Con 11 hace falta ventaja de 2' : 'En alargue la diferencia es de 2' };
}

// sets: [[puntosA, puntosB], ...]; bestOf: 3, 5 o 7.
export function validateMatch(sets, bestOf = 5) {
  const need = Math.ceil(bestOf / 2);
  let sa = 0, sb = 0;
  for (let i = 0; i < sets.length; i++) {
    if (sa === need || sb === need) return { ok: false, error: `Ya terminó antes del set ${i + 1}` };
    const [a, b] = sets[i], v = validateSet(a, b);
    if (!v.ok) return { ok: false, error: `Set ${i + 1}: ${v.error}` };
    a > b ? sa++ : sb++;
  }
  if (sa !== need && sb !== need) return { ok: false, error: `El partido no terminó (mejor de ${bestOf}: gana quien llega a ${need})` };
  return { ok: true, sets_a: sa, sets_b: sb };
}

export function summary(sets) {
  return sets.reduce((s, [a, b]) => ({ pf: s.pf + a, pc: s.pc + b, cerrados: s.cerrados + (Math.abs(a - b) === 2 ? 1 : 0) }), { pf: 0, pc: 0, cerrados: 0 });
}
