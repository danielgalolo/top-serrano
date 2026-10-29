// Clasifica el dispositivo para elegir el layout. Pura: recibe medidas, no toca el DOM.
// phone: lado corto < 600. tablet: 600–1199 de ancho (o pantalla táctil de hasta 1199 de alto en apaisado). desktop: mouse y ancho ≥ 1200.
const TIPOS = ['phone', 'tablet', 'desktop'];
export function detectDevice({ width, height = width, touch = false, override } = {}) {
  if (TIPOS.includes(override)) return override;
  const corto = Math.min(width, height);
  if (width < 600 || (touch && corto < 600)) return 'phone';
  if (!touch && width >= 1200) return 'desktop';
  return 'tablet';
}
