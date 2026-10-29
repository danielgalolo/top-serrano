import { CONFIG } from './config.js';
import { createApi } from './api.js';
import { applyMatches } from './lib/elo.js';
import { rank, gapToNext } from './lib/ranking.js';
import { h2h, winProbability } from './lib/h2h.js';
import { validateMatch, summary } from './lib/sets.js';
import { detectDevice } from './lib/device.js';
import { eloHistory, playerStats } from './lib/perfil.js';
import { logros } from './lib/logros.js';
import { findDuplicate, validateReceipt } from './lib/payments.js';
import { exportBackup, toCsv } from './lib/backup.js';
import { kpis, monthlyIncome, lastMonths, debtors, waReminder } from './lib/dashboard.js';

const $ = s => document.querySelector(s);
const root = $('#root'), tabs = $('#tabs');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = c => '$ ' + Math.round(c / 100).toLocaleString('es-AR');
const fdate = d => { if (!d) return ''; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d)); return m ? `${m[3]}/${m[2]}` : new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }); };
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2800); };

const params = new URLSearchParams(location.search);
// Layout según dispositivo: celular (barra abajo) o tablet/PC (menú lateral, 2 columnas). ?device=phone|tablet|desktop fuerza uno.
const setDevice = () => { document.documentElement.dataset.device = detectDevice({ width: innerWidth, height: innerHeight, touch: matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0, override: params.get('device') }); };
setDevice(); addEventListener('resize', setDevice); addEventListener('orientationchange', setDevice);
const st = { api: null, user: null, data: null, view: 'pos', cat: '', a: null, b: null, month: new Date().toISOString().slice(0, 7) };
const isStaff = () => ['tesorero', 'admin'].includes(st.data?.role);

async function boot() {
  try {
    st.api = await createApi(CONFIG, { demo: params.has('demo') });
    st.user = await st.api.session();
    if (st.user) await loadAll(); else loginView();
  } catch (e) { root.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  if ('serviceWorker' in navigator && !params.has('demo')) navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function loadAll() {
  st.data = await st.api.load(CONFIG.clubSlug, st.user);
  const s = applyMatches(st.data.players, st.data.matches);
  st.stats = s;
  st.players = st.data.players.map(p => ({ ...p, elo: s[p.id]?.elo ?? 1500 }));
  st.mine = st.players.find(p => p.user_id === st.user.id) ?? null;
  st.view = 'pos';
  render();
}

function loginView() {
  tabs.hidden = true;
  root.innerHTML = `<header class="top"><img src="logo-club.png" alt="" width="40" height="40"><h2>Top Serrano</h2></header>
  <form class="f card" id="lf"><h3>Ingresá</h3>
    <label>Mail<input name="email" type="email" autocomplete="username" required></label>
    <label>Clave<input name="password" type="password" autocomplete="current-password" required></label>
    <p class="err" id="le" role="alert"></p>
    <button class="btn">Entrar</button>
  </form>
  <section class="card mt"><h3>Probá la demo</h3><p class="muted">Datos de ejemplo, inventados. No hace falta usuario.</p>
    <div class="actions mt"><a class="btn sm" href="?demo&as=socio">Entrar como socio</a><a class="btn sm ghost" href="?demo&as=tesorero">Entrar como tesorero</a></div></section>
  <p class="foot">Un regalo de DG Soluciones IT para Top Serrano</p>`;
  if (st.api.mode === 'demo' && params.get('as')) { st.api.signIn(params.get('as') + '@demo').then(u => { st.user = u; loadAll(); }); return; }
  $('#lf').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    try { st.user = await st.api.signIn(f.get('email').trim(), f.get('password')); await loadAll(); }
    catch (er) { $('#le').textContent = er.message; }
  };
}

function render() {
  const t = [['pos', 'Posiciones'], ['duelo', 'Duelo'], ['pagos', 'Pagos']];
  if (isStaff()) t.push(['admin', 'Tablero']);
  tabs.hidden = false; tabs.style.setProperty('--n', t.length);
  tabs.innerHTML = t.map(([k, l]) => `<a href="#" data-v="${k}" ${(st.view === 'perfil' ? 'pos' : st.view) === k ? 'aria-current="page"' : ''}>${l}</a>`).join('');
  tabs.querySelectorAll('a').forEach(a => a.onclick = e => { e.preventDefault(); st.view = a.dataset.v; render(); });
  const head = `${st.api.mode === 'demo' ? '<p class="demo-b">Demo con datos de ejemplo</p>' : ''}<header class="top"><img src="logo-club.png" alt="" width="36" height="36"><h2>${esc(st.data.club.name)}</h2><button class="pill" id="out">Salir</button></header>`;
  const body = { pos: posView, duelo: dueloView, pagos: pagosView, admin: adminView, perfil: perfilView }[st.view]();
  root.classList.toggle('wide', st.view === 'admin');
  root.innerHTML = head + body + '<p class="foot">Hecho por DG Soluciones IT</p>';
  $('#out').onsubmit = null;
  $('#out').onclick = async () => { await st.api.signOut(); st.user = null; loginView(); };
  bind[st.view]?.();
}
const bind = {};

// ---- Posiciones
function posView() {
  const cats = [...new Set(st.players.map(p => p.category).filter(Boolean))].sort();
  const list = rank(st.players, { category: st.cat || undefined });
  const all = rank(st.players);
  const gap = st.mine ? gapToNext(all, st.mine.id) : null;
  const meCard = st.mine && gap ? `<section class="card me"><div class="pos disp">${gap.position}<sup>°</sup></div><div>
    <p><b>${esc(st.mine.name)}</b> · ${st.mine.elo} puntos</p>
    <p class="foot" style="text-align:left;margin:4px 0 0">${gap.up ? `Te faltan ${gap.up.gap} para pasar a ${esc(all[gap.position - 2].name)}` : 'Vas primero'}</p></div></section>` : '';
  return `${meCard}<div class="chips mt" role="group" aria-label="Categoría">
    <button class="chip" data-c="" ${!st.cat ? 'aria-pressed="true"' : ''}>Todos</button>
    ${cats.map(c => `<button class="chip" data-c="${esc(c)}" ${st.cat === c ? 'aria-pressed="true"' : ''}>${esc(c)}</button>`).join('')}</div>
    <ol class="rank mt">${list.map((p, i) => `<li class="row ${st.mine?.id === p.id ? 'is-me' : ''}" data-pid="${esc(p.id)}" tabindex="0" role="link" aria-label="Ver perfil de ${esc(p.name)}"><span class="p">${i + 1}</span><span class="av">${esc(p.name.split(' ').map(w => w[0]).slice(0, 2).join(''))}</span>
      <span><span class="nm">${esc(p.name)}</span><span class="ct">${esc(p.category ?? '')} · ${st.stats[p.id]?.played ?? 0} partidos</span></span><span class="sc num"><b>${p.elo}</b></span></li>`).join('')}</ol>`;
}
bind.pos = () => {
  document.querySelectorAll('.chip').forEach(c => c.onclick = () => { st.cat = c.dataset.c; render(); });
  document.querySelectorAll('[data-pid]').forEach(r => { const go = () => { st.pid = r.dataset.pid; st.vs = ''; st.view = 'perfil'; scrollTo(0, 0); render(); }; r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
};

// ---- Perfil del jugador
const COL_YO = '#3987e5', COL_RIVAL = '#d95926';
function eloChart(series) {
  const W = 340, H = 170, L = 38, R = 10, T = 12, B = 22;
  const pts = series.flatMap(s => s.h);
  const fechas = pts.map(e => e.date && +new Date(e.date)).filter(Boolean);
  if (!fechas.length) return '<p class="muted">Todavía no hay partidos para graficar.</p>';
  const t0 = Math.min(...fechas) - 864e5, t1 = Math.max(...fechas);
  const lo = Math.floor((Math.min(...pts.map(e => e.elo)) - 10) / 10) * 10, hi = Math.ceil((Math.max(...pts.map(e => e.elo)) + 10) / 10) * 10;
  const X = d => L + ((d ? +new Date(d) : t0) - t0) / Math.max(1, t1 - t0) * (W - L - R), Y = v => T + (hi - v) / Math.max(1, hi - lo) * (H - T - B);
  const grid = [lo, Math.round((lo + hi) / 2), hi].map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" opacity=".15"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="currentColor" opacity=".7">${v}</text>`).join('');
  const lines = series.map(s => `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" points="${s.h.map(e => `${X(e.date).toFixed(1)},${Y(e.elo).toFixed(1)}`).join(' ')}"/>` +
    s.h.map(e => `<circle cx="${X(e.date).toFixed(1)}" cy="${Y(e.elo).toFixed(1)}" r="3.2" fill="${s.color}"/>`).join('') +
    `<text x="${Math.min(W - R - 2, X(s.h.at(-1).date)).toFixed(1)}" y="${(Y(s.h.at(-1).elo) - 8).toFixed(1)}" text-anchor="end" font-size="12" font-weight="700" fill="${s.color}">${s.h.at(-1).elo}</text>`).join('');
  const f = d => new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Evolución del ELO">${grid}${lines}
    <text x="${L}" y="${H - 5}" font-size="11" fill="currentColor" opacity=".7">${f(t0 + 864e5)}</text><text x="${W - R}" y="${H - 5}" text-anchor="end" font-size="11" fill="currentColor" opacity=".7">${f(t1)}</text></svg>`;
}
function perfilView() {
  const P = st.players.find(p => p.id === st.pid);
  if (!P) { st.view = 'pos'; return posView(); }
  const act = rank(st.players), pos = act.findIndex(p => p.id === P.id) + 1;
  const ms = st.data.matches, hist = eloHistory(P.id, st.players, ms), stt = playerStats(P.id, ms);
  const lg = logros({ id: P.id, matches: ms, history: hist, position: pos || null });
  const R = st.vs ? st.players.find(p => p.id === st.vs) : null;
  const hR = R ? eloHistory(R.id, st.players, ms) : null, sR = R ? playerStats(R.id, ms) : null;
  const lgR = R ? logros({ id: R.id, matches: ms, history: hR, position: act.findIndex(p => p.id === R.id) + 1 || null }) : null;
  const ini = n => n.split(' ').map(w => w[0]).slice(0, 2).join('');
  const first = n => n.split(' ')[0];
  const racha = stt.streak > 0 ? `🔥 ${stt.streak} ganados seguidos` : stt.streak < 0 ? `${-stt.streak} perdidos seguidos` : 'Sin racha';
  const fila = (nom, a, b, mayor = true) => { const w = a === b ? 0 : (a > b) === mayor ? 1 : -1; return `<tr><th scope="row">${nom}</th><td class="${w > 0 ? 'win' : ''}">${a}</td><td class="${w < 0 ? 'win' : ''}">${b}</td></tr>`; };
  const cmp = R ? `<section class="card"><h3>${esc(first(P.name))} vs ${esc(first(R.name))}</h3>
    <table class="cmp"><thead><tr><th></th><th style="color:${COL_YO}">${esc(first(P.name))}</th><th style="color:${COL_RIVAL}">${esc(first(R.name))}</th></tr></thead><tbody>
    ${fila('ELO', P.elo, R.elo)}${fila('Partidos', stt.played, sR.played)}${fila('% victorias', stt.winPct + '%', sR.winPct + '%')}${fila('Mejor racha', stt.bestStreak, sR.bestStreak)}${fila('Sets a favor', stt.setsFor, sR.setsFor)}${fila('Logros', lg.filter(l => l.ganado).length, lgR.filter(l => l.ganado).length)}</tbody></table></section>` : '';
  const opts = ['<option value="">Elegí con quién compararte</option>', ...act.filter(p => p.id !== P.id).map(p => `<option value="${esc(p.id)}" ${p.id === st.vs ? 'selected' : ''}>${esc(p.name)}</option>`)].join('');
  const gan = lg.filter(l => l.ganado).length;
  return `<div class="stack"><button class="btn sm ghost back" id="back">← Volver a posiciones</button>
    <section class="card phead"><span class="av big">${esc(ini(P.name))}</span><div><h3>${esc(P.name)}</h3><p class="muted">${esc(P.category ?? '')} · puesto ${pos || '—'} · <b class="num">${P.elo}</b> de ELO</p><p class="mt">${racha}</p></div></section>
    <section class="card"><div class="mini">
      <div><b class="num">${stt.played}</b><span>partidos</span></div><div><b class="num">${stt.winPct}%</b><span>victorias</span></div>
      <div><b class="num">${stt.setsFor}-${stt.setsAgainst}</b><span>sets</span></div><div><b class="num">${stt.pf + stt.pc ? stt.pf + '-' + stt.pc : '—'}</b><span>puntos</span></div></div></section>
    <section class="card"><h3>Evolución del ELO</h3>${R ? `<p class="legend2"><i style="background:${COL_YO}"></i>${esc(first(P.name))} <i style="background:${COL_RIVAL}"></i>${esc(first(R.name))}</p>` : ''}
      ${eloChart([{ h: hist, color: COL_YO }, ...(R ? [{ h: hR, color: COL_RIVAL }] : [])])}
      <details class="mt"><summary>Ver como tabla</summary><table class="cmp"><tbody>${hist.slice(1).map(e => `<tr><td>${esc(fdate(e.date))}</td><td>${e.sets} ${e.won ? '✔' : '✘'}</td><td>${e.elo}</td></tr>`).join('') || '<tr><td>Sin partidos</td></tr>'}</tbody></table></details>
      <label class="mt">Compararme con<select id="vs">${opts}</select></label></section>
    ${cmp}
    <section class="card"><h3>Logros <span class="muted">${gan} de ${lg.length}</span></h3><div class="logros">${lg.map(l => `<div class="logro ${l.ganado ? 'on' : ''}" title="${esc(l.desc)}"><span class="ico" aria-hidden="true">${l.icono}</span><b>${esc(l.nombre)}</b><small>${l.ganado ? '¡Conseguido!' : esc(l.desc)}</small>${!l.ganado && l.progreso ? `<span class="prog"><i style="width:${Math.round(l.progreso[0] / l.progreso[1] * 100)}%"></i></span><small>${l.progreso[0]}/${l.progreso[1]}</small>` : ''}</div>`).join('')}</div></section></div>`;
}
bind.perfil = () => {
  $('#back').onclick = () => { st.view = 'pos'; render(); };
  $('#vs').onchange = e => { st.vs = e.target.value; render(); };
};

// ---- Duelo
function dueloView() {
  const act = rank(st.players);
  st.a ||= st.mine?.id ?? act[0]?.id; st.b ||= act.find(p => p.id !== st.a)?.id;
  const opt = sel => act.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const A = st.players.find(p => p.id === st.a), B = st.players.find(p => p.id === st.b);
  let res = '<p class="muted">Elegí dos jugadores distintos.</p>';
  if (A && B && A.id !== B.id) {
    const h = h2h(st.data.matches, A.id, B.id), pa = winProbability(A.elo, B.elo, h);
    res = `<section class="card"><h3>${esc(A.name)} vs ${esc(B.name)}</h3>
      <p class="num mt"><b>${h.wa}</b> - <b>${h.wb}</b> <span class="muted">en ${h.total} ${h.total === 1 ? "partido" : "partidos"}</span></p>
      <p class="mt">Chances: ${esc(A.name)} <b>${pa}%</b> · ${esc(B.name)} <b>${100 - pa}%</b></p>
      <div class="bar2 mt"><i style="width:${pa}%"></i></div>
      ${h.pf + h.pc ? `<p class="muted mt">Puntos: ${esc(A.name.split(' ')[0])} <b>${h.pf}</b> · ${esc(B.name.split(' ')[0])} <b>${h.pc}</b></p>` : ''}
      <div class="mt">${h.total ? h.last.map(g => `<p class="lastg"><b>${g.sets}</b> ${g.a_won ? '✔' : '✘'} <span class="muted">${g.parciales ? g.parciales.map(([x, y]) => x + '-' + y).join(' · ') : ''}</span></p>`).join('') : '<p class="muted">Todavía no jugaron entre ellos</p>'}</div></section>`;
  }
  const nA = esc(A?.name.split(' ')[0] ?? 'A'), nB = esc(B?.name.split(' ')[0] ?? 'B');
  const rows = n => Array.from({ length: n }, (_, i) => `<div class="setrow"><span class="muted">Set ${i + 1}</span><input inputmode="numeric" pattern="[0-9]*" name="a${i}" aria-label="Puntos ${nA} set ${i + 1}"><span>-</span><input inputmode="numeric" pattern="[0-9]*" name="b${i}" aria-label="Puntos ${nB} set ${i + 1}"></div>`).join('');
  const rec = ['tesorero', 'admin', 'comision'].includes(st.data.role) && A && B && A.id !== B.id ? `<form class="f card mt" id="mf"><h3>Cargar resultado por set</h3>
    <label>Formato<select name="bo"><option value="3">Al mejor de 3</option><option value="5" selected>Al mejor de 5</option><option value="7">Al mejor de 7</option></select></label>
    <div class="setgrid"><span></span><b>${nA}</b><span></span><b>${nB}</b></div><div id="setrows">${rows(5)}</div>
    <p class="muted" id="setmsg" role="status">Cargá los puntos de cada set (se juega a 11, con 2 de ventaja).</p>
    <button class="btn" id="msave" disabled>Guardar partido</button></form>` : '';
  return `<div class="stack"><form class="f"><label>Jugador A<select id="sa">${opt(st.a)}</select></label><label>Jugador B<select id="sb">${opt(st.b)}</select></label></form>${res}${rec}</div>`;
}
bind.duelo = () => {
  $('#sa').onchange = e => { st.a = e.target.value; render(); };
  $('#sb').onchange = e => { st.b = e.target.value; render(); };
  const mf = $('#mf');
  if (mf) {
    const read = () => {
      const bo = +mf.bo.value; const sets = [];
      for (let i = 0; i < bo; i++) { const a = mf['a' + i].value.trim(), b = mf['b' + i].value.trim(); if (a === '' && b === '') continue; sets.push([+a, +b]); }
      return { bo, sets, v: sets.length ? validateMatch(sets, bo) : { ok: false, error: 'Cargá los puntos de cada set (se juega a 11, con 2 de ventaja).' } };
    };
    const refresh = () => { const { v, sets } = read(); $('#msave').disabled = !v.ok;
      $('#setmsg').textContent = v.ok ? `Resultado: ${v.sets_a}-${v.sets_b} en sets · puntos ${summary(sets).pf}-${summary(sets).pc}` : v.error; };
    mf.oninput = refresh;
    mf.bo.onchange = () => { const bo = +mf.bo.value; mf.querySelectorAll('.setrow').forEach((r, i) => { r.hidden = i >= bo; }); refresh(); };
    mf.bo.onchange();
    mf.onsubmit = async e => {
      e.preventDefault(); const { v, sets } = read(); if (!v.ok) return toast(v.error);
      try { const m = await st.api.addMatch({ club_id: st.data.club.id, a_id: st.a, b_id: st.b, sets_a: v.sets_a, sets_b: v.sets_b, set_scores: sets, created_by: st.user.id }); if (!st.data.matches.includes(m)) st.data.matches.push(m); await reloadKeep('duelo'); toast('Partido guardado'); }
      catch (er) { toast(er.message); }
    };
  }
};
async function reloadKeep(v) { await loadAll(); st.view = v; render(); }

// ---- Pagos
const CONCEPTS = [['cuota', 'Cuota'], ['producto', 'Producto'], ['torneo', 'Torneo']];
function payRow(p, staff) {
  const who = st.players.find(x => x.id === p.player_id)?.name ?? '';
  return `<div class="lr"><div><b>${esc(CONCEPTS.find(c => c[0] === p.concept)?.[1] ?? p.concept)}</b> · ${money(p.amount_cents)}<br><span class="muted">${staff ? esc(who) + ' · ' : ''}${esc(fdate(p.paid_at ?? p.created_at))}${p.operation_ref ? ' · op ' + esc(p.operation_ref) : ''}${p.method === 'efectivo' ? ' · efectivo' : ''}</span></div>
    <div class="actions">${staff && p.status === 'pendiente' ? `<button class="btn sm ok" data-ok="${esc(p.id)}">Aprobar</button><button class="btn sm no" data-no="${esc(p.id)}">Rechazar</button>` : `<span class="statusp ${esc(p.status)}">${esc(p.status)}</span>`}</div></div>`;
}
function pagosView() {
  const mine = st.data.payments.filter(p => isStaff() ? false : true);
  const pend = st.data.payments.filter(p => p.status === 'pendiente');
  const form = (st.mine || isStaff()) ? `<form class="f card" id="pf"><h3>Informar un pago</h3>
    ${isStaff() ? `<label>Jugador<select name="player">${st.players.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>` : ''}
    <label>Concepto<select name="concept">${CONCEPTS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
    <label>Monto en pesos<input name="amount" inputmode="decimal" required placeholder="25000"></label>
    <label>Número de operación<input name="op" placeholder="Lo ves en el comprobante"></label>
    <label>Fecha del pago<input name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}"></label>
    ${isStaff() ? '' : '<label>Foto del comprobante (opcional)<input name="file" type="file" accept="image/*,application/pdf"></label>'}
    ${isStaff() ? '<label><input type="checkbox" name="cash"> Es efectivo (se aprueba al toque)</label>' : ''}
    <p class="err" id="pe" role="alert"></p><button class="btn">Enviar</button></form>` : '<p class="muted">Tu usuario todavía no está asociado a un jugador. Pedile al tesorero que lo vincule.</p>';
  const list = isStaff()
    ? `<section class="card"><h3>Pendientes (${pend.length})</h3>${pend.map(p => payRow(p, true)).join('') || '<p class="muted">Nada para revisar</p>'}</section>`
    : `<section class="card"><h3>Mis pagos</h3>${mine.map(p => payRow(p, false)).join('') || '<p class="muted">Todavía no informaste pagos</p>'}</section>`;
  return `<div class="stack">${form}${list}</div>`;
}
bind.pagos = () => {
  const pf = $('#pf');
  if (pf) pf.onsubmit = async e => {
    e.preventDefault(); const f = new FormData(pf), err = $('#pe');
    const pesos = parseFloat(String(f.get('amount')).replace(/\./g, '').replace(',', '.'));
    const playerId = isStaff() ? f.get('player') : st.mine.id;
    const np = { club_id: st.data.club.id, player_id: playerId, user_id: st.user.id, concept: f.get('concept'),
      amount_cents: Math.round(pesos * 100), operation_ref: f.get('op').trim() || null, paid_at: f.get('date') };
    const v = validateReceipt({ amount_cents: np.amount_cents, paid_at: np.paid_at, payer: playerId });
    if (!v.ok) { err.textContent = 'Revisá: ' + v.problems.join(', '); return; }
    if (findDuplicate(np, st.data.payments)) { err.textContent = 'Ese comprobante ya fue informado.'; return; }
    try {
      if (isStaff() && f.get('cash')) await st.api.addCash(np);
      else { const file = f.get('file'); await st.api.informPayment(np, file && file.size ? file : null); }
      toast('Pago enviado'); await reloadKeep('pagos');
    } catch (er) { err.textContent = /duplicate|unique/i.test(er.message) ? 'Ese comprobante ya fue informado.' : er.message; }
  };
  document.querySelectorAll('[data-ok],[data-no]').forEach(b => b.onclick = async () => {
    try { await st.api.review(b.dataset.ok || b.dataset.no, b.dataset.ok ? 'aprobado' : 'rechazado', st.user.id); await reloadKeep(st.view); toast('Listo'); } catch (er) { toast(er.message); }
  });
};

// ---- Tablero del tesorero
const CONC_COLOR = { cuota: '#3987e5', producto: '#d95926', torneo: '#199e70' };
const MESN = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mlabel = m => MESN[Number(m.slice(5, 7)) - 1] + (m.endsWith('-01') ? ' ' + m.slice(2, 4) : '');
const shiftMonth = (m, d) => { const [y, n] = m.split('-').map(Number); const t = y * 12 + (n - 1) + d; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

function incomeChart(rows) {
  const W = 400, H = 190, L = 8, B = 24, T = 18, bw = 34;
  const max = Math.max(1, ...rows.map(r => r.total));
  const step = (W - L * 2) / rows.length;
  const y = v => T + (H - T - B) * (1 - v / max);
  const bars = rows.map((r, i) => {
    const x = L + step * i + (step - bw) / 2; let acc = 0;
    const segs = ['cuota', 'producto', 'torneo'].map(c => {
      if (!r[c]) return ''; const y1 = y(acc + r[c]), y0 = y(acc); acc += r[c];
      return `<rect x="${x}" y="${y1 + 1}" width="${bw}" height="${Math.max(0, y0 - y1 - 2)}" rx="3" fill="${CONC_COLOR[c]}"><title>${esc(mlabel(r.month))} · ${c}: ${money(r[c])}</title></rect>`;
    }).join('');
    const tot = r.total ? `<text x="${x + bw / 2}" y="${y(r.total) - 5}" text-anchor="middle" fill="#AEBBB3" font-size="10">${esc(money(r.total).replace('$ ', '$'))}</text>` : '';
    return segs + tot + `<text x="${x + bw / 2}" y="${H - 7}" text-anchor="middle" fill="#7C8C82" font-size="11">${esc(mlabel(r.month))}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos aprobados por mes y concepto" style="width:100%;height:auto"><line x1="${L}" x2="${W - L}" y1="${H - B}" y2="${H - B}" stroke="#27322B"/>${bars}</svg>`;
}

function adminView() {
  const m = st.month, k = kpis(st.players, st.data.payments, m);
  const rows = monthlyIncome(st.data.payments, lastMonths(m, 6));
  const dbt = debtors(st.players, st.data.payments, m);
  const delta = k.deltaPct == null ? 'sin mes anterior para comparar' : `${k.deltaPct >= 0 ? '▲' : '▼'} ${Math.abs(k.deltaPct)}% vs mes anterior`;
  const tile = (lab, val, sub, extra = '') => `<div class="card tile"><div class="muted">${lab}</div><div class="big num">${val}</div><div class="sub2">${sub}</div>${extra}</div>`;
  const legend = Object.entries(CONC_COLOR).map(([c, col]) => `<span class="lg"><i style="background:${col}"></i>${c}</span>`).join('');
  const tbl = `<table class="tb"><tr><th>Mes</th><th>Cuotas</th><th>Productos</th><th>Torneos</th><th>Total</th></tr>${rows.map(r => `<tr><td>${esc(mlabel(r.month))}</td><td>${money(r.cuota)}</td><td>${money(r.producto)}</td><td>${money(r.torneo)}</td><td><b>${money(r.total)}</b></td></tr>`).join('')}</table>`;
  return `<div class="stack"><div class="monthbar"><button class="btn sm ghost" id="mp" aria-label="Mes anterior">‹</button><h2>${esc(mlabel(m))} ${esc(m.slice(0, 4))}</h2><button class="btn sm ghost" id="mn" aria-label="Mes siguiente" ${m >= new Date().toISOString().slice(0, 7) ? 'disabled' : ''}>›</button></div>
  <div class="tiles">
    ${tile('Cuotas al día', `${k.alDia}/${k.total}`, `${k.pct}% de los socios`, `<div class="bar2 mt"><i style="width:${k.pct}%"></i></div>`)}
    ${tile('Ingresos del mes', money(k.ingresos), delta)}
    ${tile('Por revisar', k.pendientes, k.pendientes ? '<a href="#" id="gp" class="lnk">Ir a aprobar</a>' : 'Todo al día')}
    ${tile('Sin cuota', dbt.length, dbt.length ? 'Lista abajo' : 'Nadie debe')}
  </div>
  <section class="card"><h3>Ingresos de los últimos 6 meses</h3><p class="sub">Solo pagos aprobados, por fecha de pago</p>
    <div class="legend2">${legend}</div><div id="chart">${incomeChart(rows)}</div>
    <details class="mt"><summary class="muted">Ver como tabla</summary>${tbl}</details></section>
  <section class="card"><h3>Quién no pagó la cuota (${dbt.length})</h3>
    ${dbt.map(p => `<div class="lr"><span>${esc(p.name)} <span class="muted">${esc(p.category ?? '')}</span></span><a class="btn sm ghost" target="_blank" rel="noopener" href="${waReminder(p, m, st.data.club.name)}">Recordar</a></div>`).join('') || '<p class="muted">Todos al día</p>'}
    <p class="muted mt">El botón abre WhatsApp con el mensaje armado; elegís el contacto.</p></section>
  <section class="card"><h3>Stock</h3>${st.data.products.map(p => `<div class="lr"><span>${esc(p.name)}</span><span class="num">${p.stock} u · ${money(p.price_cents)}</span></div>`).join('') || '<p class="muted">Sin productos</p>'}</section>
  <section class="card"><h3>Copia de seguridad</h3><p class="muted">Bajala seguido y guardala en tu PC.</p>
    <div class="actions mt"><button class="btn sm" id="bj">Bajar copia (JSON)</button><button class="btn sm ghost" id="bc">Planilla de pagos (CSV)</button></div></section></div>`;
}
bind.admin = () => {
  $('#mp').onclick = () => { st.month = shiftMonth(st.month, -1); render(); };
  $('#mn').onclick = () => { st.month = shiftMonth(st.month, 1); render(); };
  const gp = $('#gp'); if (gp) gp.onclick = e => { e.preventDefault(); st.view = 'pagos'; render(); };
  const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
  const day = new Date().toISOString().slice(0, 10);
  $('#bj').onclick = () => dl(`copia-${st.data.club.slug}-${day}.json`, exportBackup({ clubs: [st.data.club], players: st.data.players, matches: st.data.matches, payments: st.data.payments, products: st.data.products }, { club: st.data.club.name }), 'application/json');
  $('#bc').onclick = () => {
    const r = st.data.payments.map(p => ({ ...p, jugador: st.players.find(x => x.id === p.player_id)?.name ?? '', monto: p.amount_cents / 100 }));
    dl(`pagos-${day}.csv`, '﻿' + toCsv(r, ['paid_at', 'jugador', 'concept', 'monto', 'method', 'status', 'operation_ref']), 'text/csv');
  };
};

boot();
