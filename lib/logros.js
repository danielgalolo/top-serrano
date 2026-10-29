import { playerStats } from './perfil.js';

// Logros de un jugador. Cada uno: { id, icono, nombre, desc, ganado, progreso?: [actual, meta] }.
export function logros({ id, matches, history, position }) {
  const mios = matches.filter(m => m.sets_a !== m.sets_b && (m.a_id === id || m.b_id === id));
  const st = playerStats(id, mios);
  const ganados = mios.filter(m => (m.a_id === id ? m.sets_a > m.sets_b : m.sets_b > m.sets_a));
  const lado = m => (m.a_id === id ? 0 : 1);
  const puntos = m => (m.set_scores ?? []).map(s => [s[lado(m)], s[1 - lado(m)]]);
  const contador = (actual, meta) => ({ ganado: actual >= meta, progreso: [Math.min(actual, meta), meta] });
  const maxElo = Math.max(...history.map(h => h.elo));
  let antes = history[0]?.elo ?? 1500;
  const david = history.slice(1).some(h => { const r = h.won && h.rivalElo - antes >= 100; antes = h.elo; return r; });
  return [
    { id: 'debut', icono: '🏓', nombre: 'Debut', desc: 'Jugar tu primer partido', ganado: st.played >= 1 },
    { id: 'primer_triunfo', icono: '🥇', nombre: 'Primer triunfo', desc: 'Ganar un partido', ganado: ganados.length >= 1 },
    { id: 'racha3', icono: '🔥', nombre: 'Racha de 3', desc: 'Ganar 3 partidos seguidos', ...contador(st.bestStreak, 3) },
    { id: 'racha5', icono: '⚡', nombre: 'Imparable', desc: 'Ganar 5 partidos seguidos', ...contador(st.bestStreak, 5) },
    { id: 'sin_ceder', icono: '🛡️', nombre: 'Sin ceder sets', desc: 'Ganar 3-0', ganado: ganados.some(m => (m.a_id === id ? m.sets_b : m.sets_a) === 0) },
    { id: 'remontada', icono: '🔄', nombre: 'Remontada', desc: 'Ganar después de perder el primer set', ganado: ganados.some(m => { const p = puntos(m)[0]; return p && p[0] < p[1]; }) },
    { id: 'alargue', icono: '⏱️', nombre: 'Rey del alargue', desc: 'Ganar un set de 12 o más puntos', ganado: ganados.some(m => puntos(m).some(([a, b]) => a > b && a >= 12)) },
    { id: 'david', icono: '🪨', nombre: 'David vs Goliat', desc: 'Ganarle a alguien con 100+ de ELO más', ganado: david },
    { id: 'diez', icono: '🎯', nombre: '10 partidos', desc: 'Jugar 10 partidos', ...contador(st.played, 10) },
    { id: 'escalador', icono: '📈', nombre: 'Escalador', desc: 'Llegar a 50 puntos de ELO sobre el inicial', ...contador(Math.max(0, maxElo - 1500), 50) },
    { id: 'podio', icono: '🏆', nombre: 'En el podio', desc: 'Estar entre los 3 primeros', ganado: position != null && position <= 3 },
  ];
}
