// Página pública de reservas de cada negocio: /b/<slug>
import { h, api, toast, ymd, parse, DOW, MONTHS, longDate } from './common.js';

const slug = location.pathname.split('/').pop();
const app = document.getElementById('app');

let biz;
try { biz = await api('/api/public/' + slug); } catch (e) {
  app.replaceChildren(h('section', { class: 'card', style: 'text-align:center;margin-top:60px' }, h('h1', { style: 'font-size:1.5rem;margin-bottom:8px' }, 'Reservas no disponibles'), h('p', { class: 'muted' }, e.message)));
  throw e;
}
document.title = `Reservar turno · ${biz.name}`;

const st = { service: biz.services[0], date: null, time: null };
const days = Array.from({ length: 21 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return ymd(d); });
const servicesEl = h('div', { class: 'chips' });
const daysEl = h('div', { class: 'chips', style: 'flex-wrap:nowrap;overflow-x:auto;padding-bottom:6px;overscroll-behavior-x:contain' });
const timesEl = h('div', { class: 'chips' });
const name = h('input', { name: 'name', required: true, maxlength: 80, autocomplete: 'name', placeholder: 'Tu nombre' });
const phone = h('input', { name: 'phone', type: 'tel', inputmode: 'tel', required: true, maxlength: 30, autocomplete: 'tel', placeholder: 'Tu WhatsApp' });
const summary = h('p', { style: 'margin:4px 0;font-weight:600' }, 'Elegí un día y un horario.');
const submit = h('button', { class: 'btn primary', type: 'submit', disabled: true }, 'Reservar turno');
const err = h('p', { class: 'err', role: 'alert' });
const form = h('form', { class: 'form', novalidate: true }, h('label', {}, 'Nombre', name), h('label', {}, 'WhatsApp', phone), summary, err, submit);
const done = h('div', { class: 'card', hidden: true, style: 'text-align:center' });

const renderServices = () => servicesEl.replaceChildren(...biz.services.map((s) => h('button', { type: 'button', class: 'chip' + (s === st.service ? ' on' : ''), onclick: () => { st.service = s; renderServices(); sum(); } }, s)));
const sum = () => { summary.textContent = st.date && st.time ? `${longDate(st.date)} · ${st.time} hs · ${st.service}` : 'Elegí un día y un horario.'; submit.disabled = !(st.date && st.time); };
const renderDays = () => daysEl.replaceChildren(...days.map((d) => { const dt = parse(d); return h('button', { type: 'button', class: 'chip day' + (d === st.date ? ' on' : ''), 'aria-label': longDate(d), onclick: () => pick(d) }, h('small', {}, DOW[dt.getDay()]), h('b', {}, String(dt.getDate())), h('small', {}, MONTHS[dt.getMonth()].slice(0, 3))); }));

async function pick(date) {
  st.date = date; st.time = null; renderDays(); sum();
  timesEl.replaceChildren(h('span', { class: 'muted' }, 'Cargando…'));
  const { times } = await api(`/api/public/${slug}/slots?date=${date}`);
  if (st.date !== date) return;
  timesEl.replaceChildren(...(times.length ? times.map((t) => h('button', { type: 'button', class: 'chip', onclick: (e) => {
    st.time = t; timesEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on'); sum();
  } }, t)) : [h('span', { class: 'muted' }, 'No hay horarios libres ese día.')]));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submit.disabled = true; err.textContent = '';
  try {
    await api(`/api/public/${slug}/book`, { method: 'POST', body: { name: name.value, phone: phone.value, service: st.service, date: st.date, time: st.time } });
    form.hidden = true; done.hidden = false;
    done.replaceChildren(h('h2', {}, '¡Turno reservado!'), h('p', {}, `${longDate(st.date)} · ${st.time} hs`), h('p', { class: 'muted' }, `${biz.name} lo va a confirmar pronto.`));
  } catch (ex) { err.textContent = ex.message; submit.disabled = false; pick(st.date); }
});

app.replaceChildren(
  h('p', { class: 'eyebrow' }, 'Reservá tu turno'), h('h1', { style: 'font-size:2.2rem;margin:4px 0 18px' }, biz.name),
  h('section', { class: 'card form', style: 'gap:16px' },
    h('label', {}, '1 · Servicio', servicesEl), h('label', {}, '2 · Día', daysEl), h('label', {}, '3 · Horario', timesEl),
    h('label', {}, '4 · Tus datos'), form, done),
  h('p', { class: 'muted', style: 'text-align:center;font-size:.8rem;margin-top:18px' }, 'Agenda gestionada con Agendo'));
renderServices(); renderDays();
const first = days[0]; pick(first);
