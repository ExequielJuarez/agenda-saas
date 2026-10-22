// Panel del cliente: agenda, turnos, clientes y suscripción.
import { h, api, toast, ymd, parse, longDate, DOW, MONTHS, waLink } from './common.js';

const app = document.getElementById('app');
const money = (n) => '$' + Math.round(n).toLocaleString('es-AR');
const STATUS = { pending: 'Pendiente', confirmed: 'Confirmado', done: 'Atendido', cancelled: 'Cancelado' };
const SUB = { active: 'Al día', trial: 'Prueba gratis', overdue: 'Vencida', blocked: 'Bloqueada', suspended: 'Suspendida' };
const today = ymd(new Date());
const st = { me: null, stats: null, appts: [], services: [], reminders: [], tab: 'today', sel: today, usable: true };

const logout = async () => { try { await api('/api/app/logout', { method: 'POST' }); } catch {} st.me = null; showLogin(); };
const call = async (path, opts) => {
  try { return await api(path, opts); }
  catch (e) { if (e.status === 401) showLogin(); else if (e.status === 402) { st.usable = false; render(); } else toast(e.message); throw e; }
};

async function load() {
  const me = await call('/api/app/me');
  st.me = me;
  st.usable = me.usable;
  if (me.usable) {
    const [a, s, sv, rm] = await Promise.all([call('/api/app/appointments?from=' + today), call('/api/app/stats'), call('/api/app/services'), call('/api/app/reminders')]);
    st.appts = a.appointments;
    st.stats = s;
    st.services = sv.services;
    st.reminders = rm.reminders;
  }
  render();
}

function showLogin(msg) {
  const email = h('input', { type: 'email', id: 'em', required: true, autocomplete: 'username', placeholder: 'tu@email.com' });
  const pw = h('input', { type: 'password', id: 'pw', required: true, autocomplete: 'current-password', placeholder: 'Contraseña' });
  const err = h('p', { class: 'err', role: 'alert' }, msg || '');
  app.replaceChildren(h('main', { class: 'login' }, h('form', { class: 'card login-card form', onsubmit: async (e) => {
    e.preventDefault();
    try {
      await api('/api/app/login', { method: 'POST', body: { email: email.value, password: pw.value } });
      await load();
    } catch (ex) { err.textContent = ex.message; }
  } },
    h('a', { class: 'brand', href: '/', style: 'margin-bottom:6px' }, h('i'), 'Agendo'),
    h('h1', {}, 'Ingresá a tu agenda'),
    h('label', { for: 'em' }, 'Email', email), h('label', { for: 'pw' }, 'Contraseña', pw), err,
    h('button', { class: 'btn primary', type: 'submit' }, 'Ingresar'),
    h('p', { class: 'muted', style: 'margin:0;font-size:.85rem' }, '¿No tenés cuenta? Pedila a quien te brinda el servicio.'))));
  email.focus();
}

// ---------- diálogos ----------
function dialog(title, body, onSubmit, label = 'Guardar') {
  const err = h('p', { class: 'err', role: 'alert' });
  const dlg = h('dialog', {}, h('h2', {}, title), h('form', { class: 'form', method: 'dialog', onsubmit: async (e) => {
    e.preventDefault();
    try { await onSubmit(Object.fromEntries(new FormData(e.target))); dlg.close(); } catch (ex) { err.textContent = ex.message; }
  } }, ...body, err, h('div', { class: 'dlg-actions' },
    h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Cancelar'), h('button', { type: 'submit', class: 'btn primary' }, label))));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

function newAppointment(date = st.sel) {
  const timeSel = h('select', { name: 'time', required: true });
  const dateIn = h('input', { name: 'date', type: 'date', value: date < today ? today : date, min: today, required: true });
  const svcSel = h('select', { name: 'serviceId' }, ...st.services.map((s) => h('option', { value: s.id }, `${s.name} · ${s.minutes} min${s.price ? ' · ' + money(s.price) : ''}`)));
  const loadTimes = async () => {
    const { times } = await call(`/api/app/slots?date=${dateIn.value}&service=${svcSel.value}`);
    timeSel.replaceChildren(...(times.length ? times.map((t) => h('option', {}, t)) : [h('option', { value: '' }, 'Sin horarios libres')]));
  };
  dateIn.addEventListener('change', loadTimes);
  svcSel.addEventListener('change', loadTimes);
  dialog('Nuevo turno', [
    h('label', {}, 'Cliente', h('input', { name: 'name', required: true, maxlength: 80, autocomplete: 'off' })),
    h('label', {}, 'WhatsApp', h('input', { name: 'phone', type: 'tel', inputmode: 'tel', maxlength: 30 })),
    h('label', {}, 'Servicio', svcSel),
    h('div', { class: 'row2' }, h('label', {}, 'Fecha', dateIn), h('label', {}, 'Hora', timeSel)),
  ], async (d) => { await call('/api/app/appointments', { method: 'POST', body: d }); toast('Turno agendado'); await load(); }, 'Agendar');
  loadTimes();
}

async function setStatus(a, status) {
  await call('/api/app/appointments/' + a.id, { method: 'PATCH', body: { status } });
  await load();
  if (status === 'confirmed' && a.phone && confirm('¿Avisarle al cliente por WhatsApp?')) {
    window.open(waLink(a.phone, `Hola ${a.name}! Tu turno del ${longDate(a.date)} a las ${a.time} hs en ${st.me.tenant.businessName} está confirmado ✅`), '_blank', 'noopener');
  }
}

// ---------- vistas ----------
const apptItem = (a, showDate) => h('div', { class: 'item' },
  h('span', { class: 'time' }, a.time),
  h('div', { class: 'main' }, h('b', {}, a.name), h('span', { class: 'muted' }, `${showDate ? longDate(a.date) + ' · ' : ''}${a.service}${a.price ? ' · ' + money(a.price) : ''}${a.source === 'web' ? ' · reserva web' : ''}`)),
  h('span', { class: 'badge ' + a.status }, STATUS[a.status]),
  h('div', { class: 'actions' },
    a.status === 'pending' ? h('button', { class: 'btn violet sm', onclick: () => setStatus(a, 'confirmed') }, 'Confirmar') : null,
    a.status === 'confirmed' ? h('button', { class: 'btn sm', onclick: () => setStatus(a, 'done') }, 'Atendido') : null,
    a.phone ? h('a', { class: 'btn sm', target: '_blank', rel: 'noopener', href: waLink(a.phone, `Hola ${a.name}! Te escribo por tu turno del ${longDate(a.date)} a las ${a.time} hs.`) }, 'WhatsApp') : null,
    a.status !== 'cancelled' && a.status !== 'done' ? h('button', { class: 'btn danger sm', onclick: () => confirm('¿Cancelar este turno?') && setStatus(a, 'cancelled') }, 'Cancelar') : null));

const onDay = (d) => st.appts.filter((a) => a.date === d);

function todayView() {
  const s = st.stats;
  const list = onDay(today).filter((a) => a.status !== 'cancelled');
  const pend = st.appts.filter((a) => a.status === 'pending');
  return [
    h('div', { class: 'grid kpis' },
      h('div', { class: 'kpi' }, h('span', {}, 'Turnos hoy'), h('strong', {}, String(s.today))),
      h('div', { class: 'kpi' }, h('span', {}, 'Por confirmar'), h('strong', {}, String(s.pending))),
      h('div', { class: 'kpi' }, h('span', {}, 'Próximos 7 días'), h('strong', {}, String(s.week))),
      h('div', { class: 'kpi' }, h('span', {}, 'Ingresos del mes'), h('strong', {}, money(s.monthIncome)), h('small', {}, s.monthExpected ? `+ ${money(s.monthExpected)} por atender` : 'turnos marcados como atendidos'))),
    pend.length ? h('section', { class: 'card' }, h('h2', {}, `Reservas por confirmar (${pend.length})`), h('div', { class: 'list' }, ...pend.slice(0, 8).map((a) => apptItem(a, true)))) : null,
    reminderList(),
    h('section', { class: 'card' }, h('div', { class: 'item', style: 'border:0;padding:0 0 10px' }, h('h2', { style: 'margin:0' }, 'Hoy · ' + longDate(today)), h('button', { class: 'btn primary sm', onclick: () => newAppointment(today) }, '+ Turno')),
      list.length ? h('div', { class: 'list' }, ...list.map((a) => apptItem(a, false))) : h('p', { class: 'empty' }, 'No hay turnos para hoy.')),
  ];
}

function agendaView() {
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return ymd(d); });
  const list = onDay(st.sel).filter((a) => a.status !== 'cancelled');
  return [
    h('div', { class: 'chips', style: 'flex-wrap:nowrap;overflow-x:auto;padding-bottom:6px;overscroll-behavior-x:contain' }, ...days.map((d) => {
      const n = onDay(d).filter((a) => a.status !== 'cancelled').length, dt = parse(d);
      return h('button', { class: 'chip day' + (d === st.sel ? ' on' : ''), onclick: () => { st.sel = d; render(); } }, h('small', {}, DOW[dt.getDay()]), h('b', {}, String(dt.getDate())), h('small', {}, n ? `${n} turno${n > 1 ? 's' : ''}` : '·'));
    })),
    h('section', { class: 'card' }, h('div', { class: 'item', style: 'border:0;padding:0 0 10px' }, h('h2', { style: 'margin:0;text-transform:capitalize' }, longDate(st.sel)), h('button', { class: 'btn primary sm', onclick: () => newAppointment(st.sel) }, '+ Turno')),
      list.length ? h('div', { class: 'list' }, ...list.map((a) => apptItem(a, false))) : h('p', { class: 'empty' }, 'Día libre. Podés agendar un turno manual.')),
  ];
}

function clientsView() {
  const cs = st.stats.clients;
  return [h('section', { class: 'card' }, h('h2', {}, `Clientes (${cs.length})`),
    cs.length ? h('div', { class: 'list' }, ...cs.map((c) => h('div', { class: 'item' },
      h('div', { class: 'main' }, h('b', {}, c.name), h('span', { class: 'muted' }, `${c.visits} turno${c.visits === 1 ? '' : 's'}${c.spent ? ' · ' + money(c.spent) : ''} · último: ${c.last}`)),
      c.phone ? h('a', { class: 'btn sm', target: '_blank', rel: 'noopener', href: waLink(c.phone, `Hola ${c.name}!`) }, 'WhatsApp') : null)))
      : h('p', { class: 'empty' }, 'Tus clientes aparecen acá a medida que reservan.'))];
}

// ---------- recordatorios por WhatsApp ----------
async function sendReminder(r) {
  // Se abre WhatsApp en el mismo toque (si no, el navegador bloquea la ventana) y después se marca como enviado.
  window.open(waLink(r.waNumber, r.text), '_blank', 'noopener');
  try { await call(`/api/app/appointments/${r.id}/reminded`, { method: 'POST', body: {} }); } catch { return; }
  st.reminders = (await call('/api/app/reminders')).reminders;
  render();
}

function reminderList() {
  const rs = st.reminders;
  if (!rs.length) return null;
  const pendientes = rs.filter((r) => !r.sentAt).length;
  const dayLabel = (d) => (d === today ? 'Hoy' : 'Mañana');
  return h('section', { class: 'card' },
    h('h2', {}, pendientes ? `Recordatorios por enviar (${pendientes})` : 'Recordatorios enviados ✓'),
    h('p', { class: 'muted', style: 'margin-top:0' }, 'Tocá el botón: se abre WhatsApp con el mensaje listo y solo tenés que enviarlo. Los clientes que reciben recordatorio faltan mucho menos.'),
    h('div', { class: 'list' }, ...rs.map((r) => h('div', { class: 'item' },
      h('span', { class: 'time' }, r.time),
      h('div', { class: 'main' }, h('b', {}, r.name), h('span', { class: 'muted' }, `${dayLabel(r.date)} · ${r.service}`),
        r.error ? h('span', { style: 'color:var(--danger);font-size:.8rem;display:block' }, `Falló el envío automático: ${r.error}`) : null),
      r.sentAt ? h('span', { class: 'badge confirmed' }, 'Enviado') : null,
      h('button', { class: 'btn sm ' + (r.sentAt ? '' : 'violet'), onclick: () => sendReminder(r) }, r.sentAt ? 'Reenviar' : 'Recordar por WhatsApp')))));
}

function remindersSettingsCard() {
  const t = st.me.tenant, s = t.settings, auto = st.me.autoReminders;
  const text = h('textarea', { name: 'reminderText', rows: 4, maxlength: 400, placeholder: st.me.defaultReminderText }, t.reminderText || '');
  const toggle = h('input', { type: 'checkbox', name: 'reminderAuto', checked: !!t.reminderAuto && auto, disabled: !auto });
  return h('section', { class: 'card' }, h('h2', {}, 'Recordatorios por WhatsApp'),
    h('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault();
      try {
        await call('/api/app/settings', { method: 'PUT', body: { businessName: t.businessName, days: s.days, from: s.from, to: s.to, step: s.step, whatsapp: t.whatsapp, reminderText: text.value, reminderAuto: toggle.checked } });
        toast('Recordatorios guardados'); await load();
      } catch {}
    } },
      h('label', {}, 'Mensaje (dejalo vacío para usar el mensaje por defecto)', text),
      h('p', { class: 'muted', style: 'margin:0;font-size:.82rem' }, 'Podés usar: {nombre} {negocio} {servicio} {fecha} {hora}'),
      h('label', { style: 'display:flex;gap:10px;align-items:center;color:var(--fg)' }, toggle, 'Enviar recordatorios automáticamente (sin tocar nada)'),
      auto ? h('p', { class: 'muted', style: 'margin:0;font-size:.82rem' }, 'Se envían solos entre las 8 y las 21 hs, hasta 24 hs antes del turno, usando la plantilla de WhatsApp del servicio.')
        : h('p', { class: 'muted', style: 'margin:0;font-size:.82rem' }, 'El envío automático todavía no está habilitado en este servicio. Mientras tanto, usá los recordatorios con un toque desde la pestaña Hoy.'),
      h('button', { class: 'btn primary', type: 'submit' }, 'Guardar')));
}

// ---------- servicios y categorías ----------
function serviceDialog(s) {
  const cats = [...new Set(st.services.map((x) => x.category))];
  const id = 'cats-' + Math.random().toString(36).slice(2, 7);
  dialog(s ? 'Editar servicio' : 'Nuevo servicio', [
    h('label', {}, 'Categoría', h('input', { name: 'category', value: s?.category || cats[0] || 'General', list: id, maxlength: 60, placeholder: 'Ej: Cortes, Barba, Color…' }), h('datalist', { id }, ...cats.map((c) => h('option', { value: c })))),
    h('label', {}, 'Nombre del servicio', h('input', { name: 'name', value: s?.name || '', required: true, maxlength: 80, placeholder: 'Ej: Corte de pelo profesional' })),
    h('div', { class: 'row2' },
      h('label', {}, 'Precio ($)', h('input', { name: 'price', type: 'number', inputmode: 'numeric', min: 0, value: s?.price ?? '', placeholder: 'Ej: 9000' })),
      h('label', {}, 'Duración (min)', h('input', { name: 'minutes', type: 'number', inputmode: 'numeric', min: 5, max: 600, step: 5, value: s?.minutes ?? 30, required: true }))),
    h('label', {}, 'Descripción (opcional)', h('textarea', { name: 'desc', rows: 3, maxlength: 300, placeholder: 'Qué incluye, para quién es, qué traer…' }, s?.desc || '')),
  ], async (d) => {
    await call(s ? `/api/app/services/${s.id}` : '/api/app/services', { method: s ? 'PUT' : 'POST', body: d });
    toast(s ? 'Servicio actualizado' : 'Servicio agregado');
    await load();
  }, s ? 'Guardar' : 'Agregar');
}

function servicesCard() {
  const groups = new Map();
  st.services.forEach((s) => groups.set(s.category, [...(groups.get(s.category) || []), s]));
  return h('section', { class: 'card' },
    h('div', { class: 'item', style: 'border:0;padding:0 0 6px' }, h('h2', { style: 'margin:0' }, 'Servicios y precios'), h('button', { class: 'btn primary sm', onclick: () => serviceDialog() }, '+ Servicio')),
    h('p', { class: 'muted', style: 'margin-top:0' }, 'Lo que cargues acá se ve en tu link de reservas, con su precio y descripción. Los horarios libres se ajustan a la duración de cada servicio.'),
    h('div', { class: 'list' }, ...[...groups].map(([cat, items]) => h('div', { class: 'grid', style: 'gap:8px' },
      h('p', { class: 'eyebrow', style: 'margin-top:8px' }, cat),
      ...items.map((s) => h('div', { class: 'item' },
        h('div', { class: 'main' }, h('b', {}, s.name), h('span', { class: 'muted' }, `${s.minutes} min${s.desc ? ' · ' + s.desc : ''}`)),
        h('strong', { class: 'num' }, s.price ? money(s.price) : 'Consultar'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn sm', onclick: () => serviceDialog(s) }, 'Editar'),
          h('button', { class: 'btn danger sm', 'aria-label': 'Eliminar', onclick: async () => {
            if (!confirm(`¿Eliminar "${s.name}"? Los turnos ya reservados se conservan.`)) return;
            try { await call(`/api/app/services/${s.id}`, { method: 'DELETE' }); toast('Servicio eliminado'); await load(); } catch {}
          } }, '✕'))))))));
}

function settingsView() {
  const t = st.me.tenant, s = t.settings, sub = t.subscription;
  const link = `${location.origin}/b/${t.slug}`;
  const dayNames = [['1', 'L'], ['2', 'M'], ['3', 'X'], ['4', 'J'], ['5', 'V'], ['6', 'S'], ['0', 'D']];
  const form = h('form', { class: 'form', onsubmit: async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await call('/api/app/settings', { method: 'PUT', body: { businessName: fd.get('businessName'), days: fd.getAll('days'), from: fd.get('from'), to: fd.get('to'), step: fd.get('step'), whatsapp: fd.get('whatsapp') } });
      toast('Ajustes guardados'); await load();
    } catch {}
  } },
    h('label', {}, 'Nombre del negocio', h('input', { name: 'businessName', value: t.businessName, maxlength: 80 })),
    h('label', {}, 'Días de atención', h('div', { class: 'checks' }, ...dayNames.map(([v, l]) => h('label', {}, h('input', { type: 'checkbox', name: 'days', value: v, checked: s.days.includes(Number(v)) }), l)))),
    h('div', { class: 'row2' }, h('label', {}, 'Desde', h('input', { type: 'time', name: 'from', value: s.from })), h('label', {}, 'Hasta', h('input', { type: 'time', name: 'to', value: s.to }))),
    h('label', {}, 'Duración de cada turno', h('select', { name: 'step' }, ...[15, 20, 30, 45, 60].map((m) => h('option', { value: m, selected: m === s.step }, `${m} minutos`)))),
    h('label', {}, 'WhatsApp del negocio (para que te lleguen las reservas)', h('input', { name: 'whatsapp', type: 'tel', inputmode: 'tel', value: t.whatsapp || '', placeholder: 'Ej: 5491155551234', maxlength: 30 })),
    h('button', { class: 'btn primary', type: 'submit' }, 'Guardar ajustes'));
  return [
    h('section', { class: 'card' }, h('h2', {}, 'Tu link de reservas'), h('p', { class: 'muted', style: 'margin-top:0' }, 'Compartilo por WhatsApp o Instagram. Los clientes reservan solos y los turnos aparecen acá.'),
      h('div', { class: 'item' }, h('code', { style: 'word-break:break-all' }, link), h('div', { class: 'actions' }, h('button', { class: 'btn sm', onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado'); } catch { prompt('Copiá el link:', link); } } }, 'Copiar'), h('a', { class: 'btn sm', href: link, target: '_blank' }, 'Abrir')))),
    servicesCard(),
    remindersSettingsCard(),
    h('section', { class: 'card' }, h('h2', {}, 'Horarios y contacto'), form),
    h('section', { class: 'card' }, h('h2', {}, 'Mi suscripción'),
      h('div', { class: 'item' }, h('div', { class: 'main' }, h('b', {}, `${money(t.price)} / mes`), h('span', { class: 'muted' }, `Vence el ${sub.paidUntil}`)), h('span', { class: 'badge ' + sub.state }, SUB[sub.state])),
      payActions()),
  ];
}

function payActions() {
  const t = st.me.tenant;
  return h('div', { class: 'actions', style: 'margin-top:12px' },
    t.payLink ? h('a', { class: 'btn violet', href: t.payLink, target: '_blank', rel: 'noopener' }, 'Pagar ahora') : null,
    h('a', { class: 'btn', target: '_blank', rel: 'noopener', href: waLink(st.me.whatsapp, `Hola! Soy de ${t.businessName}, te escribo por mi suscripción de Agendo.`) }, 'Hablar por WhatsApp'));
}

function banner() {
  const sub = st.me.tenant.subscription;
  if (sub.state === 'trial') return h('div', { class: 'banner' }, h('b', {}, `Prueba gratis: te quedan ${Math.max(0, sub.daysLeft)} días`), h('span', {}, 'Después se activa la suscripción mensual.'));
  if (sub.state === 'overdue') return h('div', { class: 'banner bad' }, h('b', {}, 'Tu suscripción está vencida'), h('span', {}, 'Regularizá el pago para no perder el acceso.'), payActions());
  if (sub.state === 'active' && sub.daysLeft <= 5) return h('div', { class: 'banner' }, h('b', {}, `Tu suscripción vence en ${sub.daysLeft} días`));
  return null;
}

function blocked() {
  return h('main', { class: 'wrap page', style: 'max-width:520px;padding-top:60px' }, h('section', { class: 'card' },
    h('h1', { style: 'font-size:1.6rem;margin-bottom:10px' }, 'Tu cuenta está en pausa'),
    h('p', { class: 'muted' }, 'La suscripción está vencida o suspendida. Tus turnos y clientes siguen guardados: al regularizar el pago se reactiva todo.'), payActions(),
    h('button', { class: 'btn sm', style: 'margin-top:14px', onclick: logout }, 'Salir')));
}

function render() {
  if (!st.me) return;
  if (!st.usable) return app.replaceChildren(blocked());
  const tabs = [['today', 'Hoy'], ['agenda', 'Agenda'], ['clients', 'Clientes'], ['settings', 'Ajustes']];
  const view = { today: todayView, agenda: agendaView, clients: clientsView, settings: settingsView }[st.tab]();
  const scroll = window.scrollY;
  app.replaceChildren(
    h('header', { class: 'bar' }, h('div', { class: 'wrap' }, h('a', { class: 'brand', href: '/app' }, h('i'), st.me.tenant.businessName), h('button', { class: 'btn sm', onclick: logout }, 'Salir'))),
    h('main', { class: 'wrap' },
      h('nav', { class: 'tabs', role: 'tablist' }, ...tabs.map(([k, l]) => h('button', { class: 'tab' + (st.tab === k ? ' on' : ''), role: 'tab', 'aria-selected': String(st.tab === k), onclick: () => { st.tab = k; render(); } }, l))),
      h('div', { class: 'page' }, banner(), ...view)));
  window.scrollTo(0, scroll);
}

(async () => { try { await load(); } catch { showLogin(); } })();
