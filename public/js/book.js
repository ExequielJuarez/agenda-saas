// Página pública de reservas de cada negocio: /b/<slug>
import { h, api, ymd, parse, DOW, MONTHS, longDate, waLink } from './common.js';

const slug = location.pathname.split('/').pop();
const app = document.getElementById('app');
const money = (n) => (n ? '$' + Math.round(n).toLocaleString('es-AR') : 'Consultar');

let biz;
try { biz = await api('/api/public/' + slug); } catch (e) {
  app.replaceChildren(h('section', { class: 'card', style: 'text-align:center;margin-top:60px' }, h('h1', { style: 'font-size:1.5rem;margin-bottom:8px' }, 'Reservas no disponibles'), h('p', { class: 'muted' }, e.message)));
  throw e;
}
const TR = biz.terms; // palabras del rubro (turno, sesión, clase…)
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
document.title = `Reservar ${TR.turno} · ${biz.name}`;

const st = { service: biz.services[0], date: null, time: null };
const days = Array.from({ length: 21 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return ymd(d); });

const servicesEl = h('div', { class: 'grid', style: 'gap:8px' });
const daysEl = h('div', { class: 'chips', style: 'flex-wrap:nowrap;overflow-x:auto;padding-bottom:6px;overscroll-behavior-x:contain' });
const timesEl = h('div', { class: 'chips' });
const name = h('input', { name: 'name', required: true, maxlength: 80, autocomplete: 'name', placeholder: 'Tu nombre' });
const phone = h('input', { name: 'phone', type: 'tel', inputmode: 'tel', required: true, maxlength: 30, autocomplete: 'tel', placeholder: 'Tu WhatsApp' });
const summary = h('p', { style: 'margin:4px 0;font-weight:600' }, 'Elegí un día y un horario.');
const submit = h('button', { class: 'btn primary', type: 'submit', disabled: true }, `Reservar ${TR.turno}`);
const err = h('p', { class: 'err', role: 'alert' });
const form = h('form', { class: 'form', novalidate: true }, h('label', {}, 'Nombre', name), h('label', {}, 'WhatsApp', phone), summary, err, submit);
const done = h('div', { class: 'card', hidden: true, style: 'text-align:center;display:grid;gap:10px' });

const sum = () => {
  const s = st.service;
  summary.textContent = st.date && st.time ? `${longDate(st.date)} · ${st.time} hs · ${s.name}${s.price ? ' · ' + money(s.price) : ''}` : 'Elegí un día y un horario.';
  submit.disabled = !(st.date && st.time);
};

// Servicios agrupados por categoría, con precio, duración y descripción
function renderServices() {
  const groups = new Map();
  biz.services.forEach((s) => groups.set(s.category, [...(groups.get(s.category) || []), s]));
  servicesEl.replaceChildren(...[...groups].flatMap(([cat, items]) => [
    groups.size > 1 || cat !== 'General' ? h('p', { class: 'eyebrow', style: 'margin:8px 0 0' }, cat) : null,
    ...items.map((s) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(s.id === st.service.id), class: 'svc-opt' + (s.id === st.service.id ? ' on' : ''), onclick: () => { st.service = s; renderServices(); reloadTimes(); } },
      h('span', { class: 'svc-info' }, h('b', {}, s.name), s.desc ? h('small', {}, s.desc) : null, h('small', {}, `${s.minutes} min`)),
      h('strong', {}, money(s.price)))),
  ]));
}

const renderDays = () => daysEl.replaceChildren(...days.map((d) => {
  const dt = parse(d);
  return h('button', { type: 'button', class: 'chip day' + (d === st.date ? ' on' : ''), 'aria-label': longDate(d), onclick: () => pick(d) }, h('small', {}, DOW[dt.getDay()]), h('b', {}, String(dt.getDate())), h('small', {}, MONTHS[dt.getMonth()].slice(0, 3)));
}));

async function pick(date) {
  st.date = date; st.time = null; renderDays(); sum();
  timesEl.replaceChildren(h('span', { class: 'muted' }, 'Cargando…'));
  const { times } = await api(`/api/public/${slug}/slots?date=${date}&service=${st.service.id}`);
  if (st.date !== date) return;
  timesEl.replaceChildren(...(times.length ? times.map((t) => h('button', { type: 'button', class: 'chip', onclick: (e) => {
    st.time = t; timesEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on'); sum();
  } }, t)) : [h('span', { class: 'muted' }, `No hay horarios libres ese día para este ${TR.servicio}.`)]));
}
const reloadTimes = () => { if (st.date) pick(st.date); else sum(); };

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submit.disabled = true; err.textContent = '';
  try {
    const { booking } = await api(`/api/public/${slug}/book`, { method: 'POST', body: { name: name.value, phone: phone.value, serviceId: st.service.id, date: st.date, time: st.time } });
    form.hidden = true; done.hidden = false;
    const msg = `Hola! Soy ${name.value}. Reservé ${booking.service} (${TR.turno}) para el ${longDate(booking.date)} a las ${booking.time} hs. ¿Me lo confirman?`;
    done.replaceChildren(
      h('h2', {}, `¡${cap(TR.turno)} reservado!`),
      h('p', { style: 'margin:0' }, `${longDate(booking.date)} · ${booking.time} hs`),
      h('p', { class: 'muted', style: 'margin:0' }, `${booking.service}${booking.price ? ' · ' + money(booking.price) : ''}`),
      h('p', { class: 'muted', style: 'margin:0' }, `${biz.name} lo va a confirmar pronto.`),
      biz.whatsapp ? h('a', { class: 'btn primary', href: waLink(biz.whatsapp, msg), target: '_blank', rel: 'noopener' }, 'Avisar por WhatsApp') : null);
  } catch (ex) { err.textContent = ex.message; submit.disabled = false; reloadTimes(); }
});

app.replaceChildren(
  h('p', { class: 'eyebrow' }, `Reservá tu ${TR.turno}`), h('h1', { style: 'font-size:2.2rem;margin:4px 0 18px' }, biz.name),
  h('section', { class: 'card form', style: 'gap:16px' },
    h('label', {}, `1 · Elegí el ${TR.servicio}`, servicesEl), h('label', {}, '2 · Día', daysEl), h('label', {}, '3 · Horario', timesEl),
    h('label', {}, '4 · Tus datos'), form, done),
  h('p', { class: 'muted', style: 'text-align:center;font-size:.8rem;margin-top:18px' }, 'Agenda gestionada con Agendo'));
renderServices(); renderDays(); pick(days[0]);
