import { CONFIG } from './config.js';
import { createApi } from './api.js';
import { applyMatches } from './lib/elo.js';
import { rank, gapToNext } from './lib/ranking.js';
import { h2h, winProbability } from './lib/h2h.js';
import { findDuplicate, upToDate, validateReceipt } from './lib/payments.js';
import { exportBackup, toCsv } from './lib/backup.js';

const $ = s => document.querySelector(s);
const root = $('#root'), tabs = $('#tabs');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = c => '$ ' + Math.round(c / 100).toLocaleString('es-AR');
const fdate = d => { if (!d) return ''; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d)); return m ? `${m[3]}/${m[2]}` : new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }); };
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2800); };

const params = new URLSearchParams(location.search);
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
    ${st.api.mode === 'demo' ? '<p class="muted">Modo demo: poné "tesorero" en el mail para ver la vista del tesorero.</p>' : ''}
  </form><p class="foot">Hecho por DG Soluciones IT</p>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    try { st.user = await st.api.signIn(f.get('email').trim(), f.get('password')); await loadAll(); }
    catch (er) { $('#le').textContent = er.message; }
  };
}

function render() {
  const t = [['pos', 'Posiciones'], ['duelo', 'Duelo'], ['pagos', 'Pagos']];
  if (isStaff()) t.push(['admin', 'Admin']);
  tabs.hidden = false; tabs.style.setProperty('--n', t.length);
  tabs.innerHTML = t.map(([k, l]) => `<a href="#" data-v="${k}" ${st.view === k ? 'aria-current="page"' : ''}>${l}</a>`).join('');
  tabs.querySelectorAll('a').forEach(a => a.onclick = e => { e.preventDefault(); st.view = a.dataset.v; render(); });
  const head = `<header class="top"><img src="logo-club.png" alt="" width="36" height="36"><h2>${esc(st.data.club.name)}</h2><button class="pill" id="out">Salir</button></header>`;
  const body = { pos: posView, duelo: dueloView, pagos: pagosView, admin: adminView }[st.view]();
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
    <ol class="rank mt">${list.map((p, i) => `<li class="row ${st.mine?.id === p.id ? 'is-me' : ''}"><span class="p">${i + 1}</span><span class="av">${esc(p.name.split(' ').map(w => w[0]).slice(0, 2).join(''))}</span>
      <span><span class="nm">${esc(p.name)}</span><span class="ct">${esc(p.category ?? '')} · ${st.stats[p.id]?.played ?? 0} partidos</span></span><span class="sc num"><b>${p.elo}</b></span></li>`).join('')}</ol>`;
}
bind.pos = () => document.querySelectorAll('.chip').forEach(c => c.onclick = () => { st.cat = c.dataset.c; render(); });

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
      <p class="num mt"><b>${h.wa}</b> - <b>${h.wb}</b> <span class="muted">en ${h.total} partidos</span></p>
      <p class="mt">Chances: ${esc(A.name)} <b>${pa}%</b> · ${esc(B.name)} <b>${100 - pa}%</b></p>
      <div class="bar2 mt"><i style="width:${pa}%"></i></div>
      <p class="muted mt">${h.total ? 'Últimos: ' + h.last.map(g => `${g.sets} ${g.a_won ? '✔' : '✘'}`).join(' · ') : 'Todavía no jugaron entre ellos'}</p></section>`;
  }
  const rec = ['tesorero', 'admin', 'comision'].includes(st.data.role) && A && B && A.id !== B.id ? `<form class="f card mt" id="mf"><h3>Cargar resultado</h3>
    <div class="g2" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label>Sets ${esc(A.name.split(' ')[0])}<input name="sa" type="number" min="0" max="5" required></label><label>Sets ${esc(B.name.split(' ')[0])}<input name="sb" type="number" min="0" max="5" required></label></div>
    <button class="btn">Guardar partido</button></form>` : '';
  return `<div class="stack"><form class="f"><label>Jugador A<select id="sa">${opt(st.a)}</select></label><label>Jugador B<select id="sb">${opt(st.b)}</select></label></form>${res}${rec}</div>`;
}
bind.duelo = () => {
  $('#sa').onchange = e => { st.a = e.target.value; render(); };
  $('#sb').onchange = e => { st.b = e.target.value; render(); };
  const mf = $('#mf');
  if (mf) mf.onsubmit = async e => {
    e.preventDefault(); const f = new FormData(mf);
    const sa = +f.get('sa'), sb = +f.get('sb');
    if (sa === sb) return toast('No puede haber empate');
    try { const m = await st.api.addMatch({ club_id: st.data.club.id, a_id: st.a, b_id: st.b, sets_a: sa, sets_b: sb, created_by: st.user.id }); if (!st.data.matches.includes(m)) st.data.matches.push(m); await reloadKeep('duelo'); toast('Partido guardado'); }
    catch (er) { toast(er.message); }
  };
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

// ---- Admin
function adminView() {
  const u = upToDate(st.players, st.data.payments, st.month);
  const ing = st.data.payments.filter(p => p.status === 'aprobado' && String(p.paid_at).startsWith(st.month)).reduce((s, p) => s + p.amount_cents, 0);
  const pend = st.data.payments.filter(p => p.status === 'pendiente').length;
  return `<div class="stack"><section class="card"><h3>Mes ${esc(st.month)}</h3>
    <p class="mt">Cuotas al día: <b>${u.alDia}/${u.total}</b> (${u.pct}%)</p><div class="bar2 mt"><i style="width:${u.pct}%"></i></div>
    <p class="mt">Ingresos aprobados: <b>${money(ing)}</b></p><p>Pagos por revisar: <b>${pend}</b></p></section>
    <section class="card"><h3>Stock</h3>${st.data.products.map(p => `<div class="lr"><span>${esc(p.name)}</span><span class="num">${p.stock} u · ${money(p.price_cents)}</span></div>`).join('') || '<p class="muted">Sin productos</p>'}</section>
    <section class="card"><h3>Copia de seguridad</h3><p class="muted">Bajala seguido y guardala en tu PC.</p>
    <div class="actions mt"><button class="btn sm" id="bj">Bajar copia (JSON)</button><button class="btn sm ghost" id="bc">Planilla de pagos (CSV)</button></div></section></div>`;
}
bind.admin = () => {
  const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
  const day = new Date().toISOString().slice(0, 10);
  $('#bj').onclick = () => dl(`copia-${st.data.club.slug}-${day}.json`, exportBackup({ clubs: [st.data.club], players: st.data.players, matches: st.data.matches, payments: st.data.payments, products: st.data.products }, { club: st.data.club.name }), 'application/json');
  $('#bc').onclick = () => {
    const rows = st.data.payments.map(p => ({ ...p, jugador: st.players.find(x => x.id === p.player_id)?.name ?? '', monto: p.amount_cents / 100 }));
    dl(`pagos-${day}.csv`, '﻿' + toCsv(rows, ['paid_at', 'jugador', 'concept', 'monto', 'method', 'status', 'operation_ref']), 'text/csv');
  };
};

boot();
