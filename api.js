// Capa de datos. Misma interfaz para Supabase y para el modo demo (sin conexión, datos de ejemplo).
import { findDuplicate } from './lib/payments.js';

export async function createApi(config, { demo = false } = {}) {
  return demo ? createDemoApi() : createSupabaseApi(config);
}

async function createSupabaseApi({ url, key }) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0');
  const sb = createClient(url, key);
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  return {
    mode: 'supabase',
    async session() { const { data } = await sb.auth.getSession(); return data.session?.user ?? null; },
    async signIn(email, password) { const { data, error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw new Error('Usuario o clave incorrectos'); return data.user; },
    async signOut() { await sb.auth.signOut(); },
    async load(slug, user) {
      const clubs = ok(await sb.from('clubs').select('*'));
      const club = clubs.find(c => c.slug === slug) ?? clubs[0];
      if (!club) throw new Error('Tu usuario no pertenece a ningún club');
      const ms = ok(await sb.from('memberships').select('role').eq('club_id', club.id).eq('user_id', user.id));
      const [players, matches, payments, products] = await Promise.all([
        sb.from('players').select('*').eq('club_id', club.id).then(ok),
        sb.from('matches').select('*').eq('club_id', club.id).then(ok),
        sb.from('payments').select('*').eq('club_id', club.id).order('created_at', { ascending: false }).then(ok),
        sb.from('products').select('*').eq('club_id', club.id).then(ok),
      ]);
      return { club, role: ms[0]?.role ?? 'socio', players, matches, payments, products, clubs };
    },
    async informPayment(p, file) {
      let receipt_path = null;
      if (file) {
        receipt_path = `${p.club_id}/${p.user_id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
        const { error } = await sb.storage.from('receipts').upload(receipt_path, file);
        if (error) throw new Error('No se pudo subir la foto: ' + error.message);
      }
      return ok(await sb.from('payments').insert({ ...p, receipt_path }).select().single());
    },
    async review(id, status, uid) { return ok(await sb.from('payments').update({ status, reviewed_by: uid, reviewed_at: new Date().toISOString() }).eq('id', id).select().single()); },
    async addCash(p) { return ok(await sb.from('payments').insert({ ...p, method: 'efectivo', status: 'aprobado' }).select().single()); },
    async addMatch(m) { return ok(await sb.from('matches').insert(m).select().single()); },
    async receiptUrl(path) { const { data, error } = await sb.storage.from('receipts').createSignedUrl(path, 120); if (error) throw new Error(error.message); return data.signedUrl; },
  };
}

async function createDemoApi() {
  const data = await (await fetch('./demo-data.json')).json();
  const users = { socio: { id: '7371fe9d-fb4d-4792-9e96-fe4f91e562ec', email: 'demo.mati' }, tesorero: { id: 'demo-tes', email: 'demo.tesorero' } };
  let current = null, seq = 100;
  const me = () => (current === 'tesorero' ? 'tesorero' : 'socio');
  return {
    mode: 'demo',
    async session() { return null; },
    async signIn(email) { current = email.includes('tesorero') ? 'tesorero' : 'socio'; return users[current]; },
    async signOut() { current = null; },
    async load() {
      const role = me();
      const payments = data.payments.filter(p => role === 'tesorero' || p.user_id === users.socio.id);
      return { club: data.club, role, players: data.players, matches: data.matches, payments, products: data.products, clubs: [data.club] };
    },
    async informPayment(p) {
      if (findDuplicate(p, data.payments)) throw new Error('duplicate key value violates unique constraint');
      const row = { id: 'n' + seq++, status: 'pendiente', method: 'transferencia', ...p }; data.payments.unshift(row); return row;
    },
    async review(id, status) { const r = data.payments.find(p => p.id === id); r.status = status; return r; },
    async addCash(p) { const row = { id: 'n' + seq++, ...p, method: 'efectivo', status: 'aprobado' }; data.payments.unshift(row); return row; },
    async addMatch(m) { const row = { id: 'n' + seq++, ...m, played_at: m.played_at ?? new Date().toISOString() }; data.matches.push(row); return row; },
    async receiptUrl() { throw new Error('Sin fotos en el modo demo'); },
  };
}
