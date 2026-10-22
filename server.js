// Agendo: micro-app de turnos por suscripción (multi-negocio).
// Sin dependencias, requiere Node 18+. Datos en data/db.json.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const PORT = Number(process.env.PORT) || 3000;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || cfg.ownerPassword;
const GRACE_DAYS = cfg.graceDays ?? 5;

// ---------- fechas ----------
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (date, n) => { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const addMonth = (date) => {
  const d = new Date(date + 'T00:00:00');
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return ymd(d);
};
const today = () => ymd(new Date());
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00'));
const isTime = (s) => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const isPast = (date, time) => {
  const n = new Date();
  return `${date} ${time}` <= `${ymd(n)} ${pad(n.getHours())}:${pad(n.getMinutes())}`;
};

// ---------- base de datos ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { tenants: [], payments: [], appointments: [] };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch {}
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// ---------- seguridad ----------
const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(pw, salt, 32).toString('hex') });
const checkPw = (pw, t) => {
  const a = Buffer.from(hashPw(pw, t.salt).hash, 'hex');
  const b = Buffer.from(t.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const sessions = new Map();
const attempts = new Map();
const throttled = (ip) => { const a = attempts.get(ip); return a && a.n >= 10 && Date.now() < a.until; };
const fail = (ip) => { const a = attempts.get(ip) || { n: 0 }; attempts.set(ip, { n: a.n + 1, until: Date.now() + 15 * 60 * 1000 }); };
const newSession = (data) => {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { ...data, exp: Date.now() + 12 * 60 * 60 * 1000 });
  return token;
};
const session = (req) => {
  const s = sessions.get(req.headers['x-token']);
  if (!s || s.exp < Date.now()) return null;
  return s;
};

// ---------- negocio ----------
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'negocio';
const defaultSettings = () => ({ days: [1, 2, 3, 4, 5, 6], from: '09:00', to: '18:00', step: 30, services: ['Turno general'] });

// Estado efectivo de la suscripción.
function subscription(t) {
  const hasPaid = db.payments.some((p) => p.tenantId === t.id);
  const t0 = today();
  let state;
  if (t.suspended) state = 'suspended';
  else if (t.paidUntil >= t0) state = hasPaid ? 'active' : 'trial';
  else if (addDays(t.paidUntil, GRACE_DAYS) >= t0) state = 'overdue';
  else state = 'blocked';
  return { state, paidUntil: t.paidUntil, daysLeft: Math.round((new Date(t.paidUntil + 'T00:00:00') - new Date(t0 + 'T00:00:00')) / 86400000) };
}
const canUse = (t) => ['trial', 'active', 'overdue'].includes(subscription(t).state);
const publicTenant = (t) => ({ id: t.id, slug: t.slug, businessName: t.businessName, email: t.email, price: t.price, payLink: t.payLink, settings: t.settings, subscription: subscription(t) });
const lastPayment = (t) => db.payments.filter((p) => p.tenantId === t.id).sort((a, b) => b.date.localeCompare(a.date))[0] || null;

function slotsFor(t, date) {
  const s = t.settings;
  if (!s.days.includes(new Date(date + 'T00:00:00').getDay())) return [];
  const taken = new Set(db.appointments.filter((a) => a.tenantId === t.id && a.date === date && a.status !== 'cancelled').map((a) => a.time));
  const out = [];
  for (let m = toMin(s.from); m < toMin(s.to); m += s.step) {
    const time = fromMin(m);
    if (!taken.has(time) && !isPast(date, time)) out.push(time);
  }
  return out;
}

function overview() {
  const t0 = today();
  const month = t0.slice(0, 7);
  const rows = db.tenants.map((t) => ({ ...publicTenant(t), createdAt: t.createdAt, lastPayment: lastPayment(t), appointments: db.appointments.filter((a) => a.tenantId === t.id).length }));
  const count = (st) => rows.filter((r) => r.subscription.state === st).length;
  const months = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 5; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const key = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
    months.push({ month: key, total: db.payments.filter((p) => p.date.startsWith(key)).reduce((s, p) => s + p.amount, 0) });
  }
  const soon = rows.filter((r) => ['active', 'trial'].includes(r.subscription.state) && r.subscription.daysLeft <= 5);
  return {
    kpis: {
      mrr: rows.filter((r) => r.subscription.state === 'active').reduce((s, r) => s + r.price, 0),
      active: count('active'), trial: count('trial'), overdue: count('overdue'), blocked: count('blocked') + count('suspended'),
      total: rows.length,
      monthRevenue: db.payments.filter((p) => p.date.startsWith(month)).reduce((s, p) => s + p.amount, 0),
      allTime: db.payments.reduce((s, p) => s + p.amount, 0),
      pending: rows.filter((r) => r.subscription.state === 'overdue').reduce((s, r) => s + r.price, 0),
      upcoming: soon.length,
      appointments: db.appointments.length,
    },
    months,
    tenants: rows.sort((a, b) => a.subscription.paidUntil.localeCompare(b.subscription.paidUntil)),
    payments: db.payments.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 30)
      .map((p) => ({ ...p, businessName: db.tenants.find((t) => t.id === p.tenantId)?.businessName || '(eliminado)' })),
    defaults: { price: cfg.price, currency: cfg.currency, trialDays: cfg.trialDays },
  };
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const send = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve, reject) => {
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > 100_000) { reject(new Error('too large')); req.destroy(); } });
  req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
});
const PAGES = { '/': 'index.html', '/owner': 'owner.html', '/app': 'app.html' };
function serveStatic(res, pathname) {
  if (PAGES[pathname]) pathname = '/' + PAGES[pathname];
  else if (/^\/b\/[\w-]+$/.test(pathname)) pathname = '/book.html';
  const file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('No encontrado');
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
}

async function api(req, res, url) {
  const p = url.pathname, q = url.searchParams, m = req.method, ip = req.socket.remoteAddress;

  // ----- config pública -----
  if (m === 'GET' && p === '/api/config') return send(res, 200, { brand: cfg.brand, price: cfg.price, currency: cfg.currency, trialDays: cfg.trialDays, whatsapp: cfg.ownerWhatsapp });

  // ----- reservas públicas por negocio -----
  const pub = p.match(/^\/api\/public\/([\w-]+)(?:\/(slots|book))?$/);
  if (pub) {
    const t = db.tenants.find((x) => x.slug === pub[1]);
    if (!t) return send(res, 404, { error: 'Negocio no encontrado' });
    if (!canUse(t)) return send(res, 403, { error: 'Las reservas online no están disponibles por el momento' });
    if (m === 'GET' && !pub[2]) return send(res, 200, { name: t.businessName, services: t.settings.services });
    if (m === 'GET' && pub[2] === 'slots') {
      const date = q.get('date');
      if (!isDate(date)) return send(res, 400, { error: 'Fecha inválida' });
      return send(res, 200, { times: slotsFor(t, date) });
    }
    if (m === 'POST' && pub[2] === 'book') {
      const b = await readBody(req);
      const name = clean(b.name, 80), phone = clean(b.phone, 30), service = clean(b.service, 80);
      if (!name || phone.replace(/\D/g, '').length < 8) return send(res, 400, { error: 'Completá nombre y un teléfono válido' });
      if (!isDate(b.date) || !isTime(b.time) || !slotsFor(t, b.date).includes(b.time)) return send(res, 409, { error: 'Ese horario ya no está disponible' });
      const a = { id: crypto.randomUUID(), tenantId: t.id, name, phone, service: t.settings.services.includes(service) ? service : t.settings.services[0], date: b.date, time: b.time, status: 'pending', source: 'web', createdAt: new Date().toISOString() };
      db.appointments.push(a);
      save();
      return send(res, 201, { ok: true });
    }
  }

  // ----- login -----
  if (m === 'POST' && p === '/api/owner/login') {
    if (throttled(ip)) return send(res, 429, { error: 'Demasiados intentos, probá más tarde' });
    const b = await readBody(req);
    if (!crypto.timingSafeEqual(sha(b.password ?? ''), sha(OWNER_PASSWORD))) { fail(ip); return send(res, 401, { error: 'Contraseña incorrecta' }); }
    return send(res, 200, { token: newSession({ role: 'owner' }) });
  }
  if (m === 'POST' && p === '/api/app/login') {
    if (throttled(ip)) return send(res, 429, { error: 'Demasiados intentos, probá más tarde' });
    const b = await readBody(req);
    const t = db.tenants.find((x) => x.email === clean(b.email, 120).toLowerCase());
    if (!t || !checkPw(String(b.password ?? ''), t)) { fail(ip); return send(res, 401, { error: 'Email o contraseña incorrectos' }); }
    return send(res, 200, { token: newSession({ role: 'tenant', tenantId: t.id }) });
  }

  const s = session(req);

  // ----- panel del dueño -----
  if (p.startsWith('/api/owner/')) {
    if (s?.role !== 'owner') return send(res, 401, { error: 'No autorizado' });
    if (m === 'GET' && p === '/api/owner/overview') return send(res, 200, overview());
    if (m === 'POST' && p === '/api/owner/tenants') {
      const b = await readBody(req);
      const businessName = clean(b.businessName, 80), email = clean(b.email, 120).toLowerCase(), password = String(b.password ?? '');
      if (!businessName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6) return send(res, 400, { error: 'Completá nombre, email válido y una contraseña de 6+ caracteres' });
      if (db.tenants.some((t) => t.email === email)) return send(res, 409, { error: 'Ya existe un cliente con ese email' });
      let slug = slugify(businessName);
      while (db.tenants.some((t) => t.slug === slug)) slug += '-' + crypto.randomInt(10, 99);
      const price = Number(b.price) > 0 ? Math.round(Number(b.price)) : cfg.price;
      const t = { id: crypto.randomUUID(), slug, businessName, email, ...hashPw(password), price, payLink: clean(b.payLink, 300), suspended: false, createdAt: today(), paidUntil: addDays(today(), cfg.trialDays), settings: defaultSettings() };
      db.tenants.push(t);
      save();
      return send(res, 201, { tenant: publicTenant(t) });
    }
    const tm = p.match(/^\/api\/owner\/tenants\/([\w-]+)(\/payments)?$/);
    if (tm) {
      const t = db.tenants.find((x) => x.id === tm[1]);
      if (!t) return send(res, 404, { error: 'No existe' });
      if (m === 'POST' && tm[2]) {
        const b = await readBody(req);
        const amount = Math.round(Number(b.amount) || t.price);
        if (amount <= 0) return send(res, 400, { error: 'Monto inválido' });
        const base = t.paidUntil > today() ? t.paidUntil : today();
        t.paidUntil = addMonth(base);
        t.suspended = false;
        db.payments.push({ id: crypto.randomUUID(), tenantId: t.id, amount, method: clean(b.method, 40) || 'Transferencia', note: clean(b.note, 120), date: today(), createdAt: new Date().toISOString() });
        save();
        return send(res, 201, { tenant: publicTenant(t) });
      }
      if (m === 'PATCH' && !tm[2]) {
        const b = await readBody(req);
        if ('suspended' in b) t.suspended = !!b.suspended;
        if (Number(b.price) > 0) t.price = Math.round(Number(b.price));
        if ('payLink' in b) t.payLink = clean(b.payLink, 300);
        if (b.businessName) t.businessName = clean(b.businessName, 80);
        if (b.password && String(b.password).length >= 6) Object.assign(t, hashPw(String(b.password)));
        save();
        return send(res, 200, { tenant: publicTenant(t) });
      }
      if (m === 'DELETE' && !tm[2]) {
        db.tenants = db.tenants.filter((x) => x.id !== t.id);
        db.appointments = db.appointments.filter((a) => a.tenantId !== t.id);
        save();
        return send(res, 200, { ok: true });
      }
    }
    return send(res, 404, { error: 'No encontrado' });
  }

  // ----- panel del cliente -----
  if (p.startsWith('/api/app/')) {
    if (s?.role !== 'tenant') return send(res, 401, { error: 'No autorizado' });
    const t = db.tenants.find((x) => x.id === s.tenantId);
    if (!t) return send(res, 401, { error: 'No autorizado' });
    if (m === 'GET' && p === '/api/app/me') return send(res, 200, { tenant: publicTenant(t), usable: canUse(t), whatsapp: cfg.ownerWhatsapp, brand: cfg.brand });
    if (!canUse(t)) return send(res, 402, { error: 'Tu suscripción está vencida. Regularizá el pago para seguir usando Agendo.' });

    const mine = () => db.appointments.filter((a) => a.tenantId === t.id);
    if (m === 'GET' && p === '/api/app/appointments') {
      const from = q.get('from') || today(), to = q.get('to') || addDays(from, 60);
      return send(res, 200, { appointments: mine().filter((a) => a.date >= from && a.date <= to).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)) });
    }
    if (m === 'GET' && p === '/api/app/stats') {
      const t0 = today(), wk = addDays(t0, 7), all = mine();
      const clients = new Map();
      all.forEach((a) => { const k = a.phone.replace(/\D/g, ''); const c = clients.get(k) || { name: a.name, phone: a.phone, visits: 0, last: '' }; c.visits += a.status !== 'cancelled' ? 1 : 0; if (a.date > c.last) { c.last = a.date; c.name = a.name; } clients.set(k, c); });
      return send(res, 200, {
        today: all.filter((a) => a.date === t0 && a.status !== 'cancelled').length,
        pending: all.filter((a) => a.status === 'pending' && a.date >= t0).length,
        week: all.filter((a) => a.date >= t0 && a.date <= wk && a.status !== 'cancelled').length,
        clients: [...clients.values()].sort((a, b) => b.last.localeCompare(a.last)),
      });
    }
    if (m === 'GET' && p === '/api/app/slots') {
      if (!isDate(q.get('date'))) return send(res, 400, { error: 'Fecha inválida' });
      return send(res, 200, { times: slotsFor(t, q.get('date')) });
    }
    if (m === 'POST' && p === '/api/app/appointments') {
      const b = await readBody(req);
      const name = clean(b.name, 80), phone = clean(b.phone, 30);
      if (!name || !isDate(b.date) || !isTime(b.time)) return send(res, 400, { error: 'Completá nombre, fecha y hora' });
      if (mine().some((a) => a.date === b.date && a.time === b.time && a.status !== 'cancelled')) return send(res, 409, { error: 'Ese horario ya está ocupado' });
      const a = { id: crypto.randomUUID(), tenantId: t.id, name, phone, service: clean(b.service, 80) || t.settings.services[0], date: b.date, time: b.time, status: 'confirmed', source: 'manual', createdAt: new Date().toISOString() };
      db.appointments.push(a);
      save();
      return send(res, 201, { appointment: a });
    }
    const am = p.match(/^\/api\/app\/appointments\/([\w-]+)$/);
    if (am) {
      const a = mine().find((x) => x.id === am[1]);
      if (!a) return send(res, 404, { error: 'No existe' });
      if (m === 'PATCH') {
        const b = await readBody(req);
        if (!['pending', 'confirmed', 'cancelled', 'done'].includes(b.status)) return send(res, 400, { error: 'Estado inválido' });
        a.status = b.status;
        save();
        return send(res, 200, { appointment: a });
      }
      if (m === 'DELETE') { db.appointments = db.appointments.filter((x) => x.id !== a.id); save(); return send(res, 200, { ok: true }); }
    }
    if (m === 'PUT' && p === '/api/app/settings') {
      const b = await readBody(req);
      const days = [...new Set((b.days || []).map(Number).filter((d) => d >= 0 && d <= 6))];
      const step = [15, 20, 30, 45, 60].includes(Number(b.step)) ? Number(b.step) : 30;
      if (!isTime(b.from) || !isTime(b.to) || toMin(b.from) >= toMin(b.to)) return send(res, 400, { error: 'Horario inválido' });
      const services = [...new Set((b.services || []).map((x) => clean(x, 60)).filter(Boolean))].slice(0, 20);
      t.settings = { days, from: b.from, to: b.to, step, services: services.length ? services : ['Turno general'] };
      if (b.businessName) t.businessName = clean(b.businessName, 80);
      save();
      return send(res, 200, { tenant: publicTenant(t) });
    }
  }
  return send(res, 404, { error: 'No encontrado' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    serveStatic(res, decodeURIComponent(url.pathname));
  } catch { send(res, 400, { error: 'Solicitud inválida' }); }
}).listen(PORT, () => {
  console.log(`${cfg.brand} -> http://localhost:${PORT}   panel dueño: /owner   panel cliente: /app`);
  if (OWNER_PASSWORD === cfg.ownerPassword) console.log('Aviso: usás la contraseña por defecto. Definí OWNER_PASSWORD.');
});
