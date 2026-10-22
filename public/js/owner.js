// Panel del dueño: suscriptores, cobros y ganancias.
import { h, api, toast, parse, MONTHS } from './common.js';

const app = document.getElementById('app');
const money = (n) => '$' + Math.round(n).toLocaleString('es-AR');
const STATE = { active: 'Al día', trial: 'Prueba', overdue: 'Vencido', blocked: 'Solo lectura', suspended: 'Suspendido' };
const fmtDate = (s) => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; };
const st = { data: null, tab: 'clients' };

const logout = async () => { try { await api('/api/owner/logout', { method: 'POST' }); } catch {} showLogin(); };
const call = async (path, opts) => {
  try { return await api(path, opts); }
  catch (e) { if (e.status === 401) { showLogin(); } else toast(e.message); throw e; }
};
const load = async () => { st.data = await call('/api/owner/overview'); render(); };

function showLogin(msg) {
  const pw = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true, placeholder: 'Contraseña' });
  const err = h('p', { class: 'err', role: 'alert' }, msg || '');
  app.replaceChildren(h('main', { class: 'login' }, h('form', { class: 'card login-card form', onsubmit: async (e) => {
    e.preventDefault();
    try {
      await api('/api/owner/login', { method: 'POST', body: { password: pw.value } });
      load();
    } catch (ex) { err.textContent = ex.message; pw.select(); }
  } },
    h('p', { class: 'eyebrow' }, 'Agendo · Dueño'), h('h1', {}, 'Tu panel'),
    h('label', { for: 'pw' }, 'Contraseña', pw), err, h('button', { class: 'btn primary', type: 'submit' }, 'Ingresar'))));
  pw.focus();
}

// ---------- diálogos ----------
function dialog(title, fields, submitLabel, onSubmit, extra) {
  const err = h('p', { class: 'err', role: 'alert' });
  const dlg = h('dialog', {}, h('h2', {}, title), h('form', { class: 'form', method: 'dialog', onsubmit: async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try { await onSubmit(data); dlg.close(); } catch (ex) { err.textContent = ex.message; }
  } }, ...fields, err, extra || null, h('div', { class: 'dlg-actions' },
    h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Cancelar'),
    h('button', { type: 'submit', class: 'btn primary' }, submitLabel))));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}
const field = (label, name, props = {}) => h('label', {}, label, h('input', { name, ...props }));

const newClient = () => dialog('Nuevo cliente', [
  field('Nombre del negocio', 'businessName', { required: true, placeholder: 'Ej: Barbería Don Pedro' }),
  h('label', {}, 'Tipo de negocio', h('select', { name: 'rubro' }, ...st.data.defaults.rubros.map((r) => h('option', { value: r.id }, r.name)))),
  field('Email (su usuario)', 'email', { type: 'email', required: true, autocomplete: 'off' }),
  field('Contraseña inicial', 'password', { type: 'text', required: true, minlength: 6, autocomplete: 'off', placeholder: 'Mínimo 6 caracteres' }),
  field('Precio mensual', 'price', { type: 'number', inputmode: 'numeric', value: st.data.defaults.price, min: 1 }),
  field('Link de pago (Mercado Pago, opcional)', 'payLink', { type: 'url', placeholder: 'https://mpago.la/…' }),
], 'Crear cliente', async (d) => { await call('/api/owner/tenants', { method: 'POST', body: d }); toast(`Cliente creado · ${st.data.defaults.trialDays} días de prueba`); await load(); });

const registerPayment = (t) => dialog(`Registrar pago · ${t.businessName}`, [
  field('Monto', 'amount', { type: 'number', inputmode: 'numeric', value: t.price, min: 1, required: true }),
  h('label', {}, 'Medio de pago', h('select', { name: 'method' }, ...['Transferencia', 'Mercado Pago', 'Efectivo', 'Otro'].map((m) => h('option', {}, m)))),
  field('Nota (opcional)', 'note', { maxlength: 120 }),
  h('p', { class: 'muted' }, 'Suma 1 mes al vencimiento y reactiva la cuenta si estaba suspendida.'),
], 'Guardar pago', async (d) => { await call(`/api/owner/tenants/${t.id}/payments`, { method: 'POST', body: d }); toast('Pago registrado'); await load(); });

const editClient = (t) => dialog(`Editar · ${t.businessName}`, [
  field('Nombre del negocio', 'businessName', { value: t.businessName }),
  field('Precio mensual', 'price', { type: 'number', value: t.price, min: 1 }),
  field('Link de pago', 'payLink', { type: 'url', value: t.payLink || '' }),
  field('Nueva contraseña (dejar vacío para no cambiar)', 'password', { type: 'text', minlength: 6, autocomplete: 'off' }),
], 'Guardar', async (d) => { await call(`/api/owner/tenants/${t.id}`, { method: 'PATCH', body: d }); toast('Cambios guardados'); await load(); });

const copy = async (text, msg) => { try { await navigator.clipboard.writeText(text); toast(msg); } catch { prompt('Copiá el link:', text); } };

// ---------- vistas ----------
function kpis() {
  const k = st.data.kpis;
  return h('div', { class: 'grid kpis' },
    h('div', { class: 'kpi hero' }, h('span', {}, 'Ingreso mensual recurrente'), h('strong', {}, money(k.mrr)), h('small', {}, `${k.active} suscriptores al día`)),
    h('div', { class: 'kpi' }, h('span', {}, 'Cobrado este mes'), h('strong', {}, money(k.monthRevenue)), h('small', {}, `Histórico: ${money(k.allTime)}`)),
    h('div', { class: 'kpi' }, h('span', {}, 'Por cobrar (vencidos)'), h('strong', {}, money(k.pending)), h('small', {}, `${k.overdue} clientes en gracia`)),
    h('div', { class: 'kpi' }, h('span', {}, 'En prueba'), h('strong', {}, String(k.trial)), h('small', {}, `${k.upcoming} vencen en 5 días`)),
    h('div', { class: 'kpi' }, h('span', {}, 'Clientes totales'), h('strong', {}, String(k.total)), h('small', {}, `${k.blocked} bloqueados/suspendidos`)),
    h('div', { class: 'kpi' }, h('span', {}, 'Turnos gestionados'), h('strong', {}, String(k.appointments)), h('small', {}, 'entre todos tus clientes')));
}

function chart() {
  const max = Math.max(1, ...st.data.months.map((m) => m.total));
  return h('section', { class: 'card' }, h('h2', {}, 'Ingresos de los últimos 6 meses'),
    h('div', { class: 'chart', role: 'img', 'aria-label': 'Gráfico de ingresos mensuales' }, ...st.data.months.map((m) =>
      h('div', { class: 'col' }, h('b', {}, m.total ? money(m.total / 1000).replace('$', '$') + 'k' : '—'),
        h('i', { style: `height:${Math.max(2, (m.total / max) * 100)}%` }), MONTHS[Number(m.month.slice(5)) - 1].slice(0, 3)))));
}

function clientsTable() {
  const rows = st.data.tenants;
  return h('section', { class: 'card' },
    h('div', { class: 'item', style: 'border:0;padding:0 0 12px' }, h('h2', { style: 'margin:0' }, `Clientes (${rows.length})`), h('button', { class: 'btn primary sm', onclick: newClient }, '+ Nuevo cliente')),
    rows.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ...['Negocio', 'Estado', 'Vence', 'Precio', 'Último pago', ''].map((c) => h('th', {}, c)))),
      h('tbody', {}, ...rows.map((t) => h('tr', {},
        h('td', {}, h('span', { class: 'name' }, t.businessName), h('span', { class: 'sub' }, `${t.email} · ${(st.data.defaults.rubros.find((r) => r.id === t.rubro) || {}).name || 'Otro'} · ${t.appointments} turnos`)),
        h('td', {}, h('span', { class: 'badge ' + t.subscription.state }, STATE[t.subscription.state])),
        h('td', { class: 'num' }, fmtDate(t.subscription.paidUntil), h('span', { class: 'sub', style: 'display:block' }, t.subscription.daysLeft >= 0 ? `en ${t.subscription.daysLeft} días` : `hace ${-t.subscription.daysLeft} días`)),
        h('td', { class: 'num' }, money(t.price)),
        h('td', { class: 'num' }, t.lastPayment ? fmtDate(t.lastPayment.date) : '—'),
        h('td', {}, h('div', { class: 'actions' },
          h('button', { class: 'btn violet sm', onclick: () => registerPayment(t) }, 'Cobrar'),
          h('button', { class: 'btn sm', onclick: () => copy(`${location.origin}/b/${t.slug}`, 'Link de reservas copiado') }, 'Link reservas'),
          h('button', { class: 'btn sm', onclick: () => editClient(t) }, 'Editar'),
          h('button', { class: 'btn sm ' + (t.subscription.state === 'suspended' ? '' : 'danger'), onclick: async () => {
            const sus = t.subscription.state !== 'suspended';
            if (sus && !confirm(`¿Suspender a ${t.businessName}? No podrá usar la app ni recibir reservas.`)) return;
            await call(`/api/owner/tenants/${t.id}`, { method: 'PATCH', body: { suspended: sus } }); toast(sus ? 'Cliente suspendido' : 'Cliente reactivado'); load();
          } }, t.subscription.state === 'suspended' ? 'Reactivar' : 'Suspender'),
          h('button', { class: 'btn sm danger', 'aria-label': 'Eliminar', onclick: async () => {
            if (!confirm(`¿Eliminar a ${t.businessName} y todos sus turnos? No se puede deshacer.`)) return;
            await call(`/api/owner/tenants/${t.id}`, { method: 'DELETE' }); toast('Cliente eliminado'); load();
          } }, '✕'))))))))
      : h('p', { class: 'empty' }, 'Todavía no tenés clientes. Creá el primero con "Nuevo cliente".'));
}

function paymentsList() {
  const ps = st.data.payments;
  return h('section', { class: 'card' }, h('h2', {}, 'Últimos cobros'),
    ps.length ? h('div', { class: 'list' }, ...ps.map((p) => h('div', { class: 'item' },
      h('div', { class: 'main' }, h('b', {}, p.businessName), h('span', { class: 'muted' }, `${fmtDate(p.date)} · ${p.method}${p.note ? ' · ' + p.note : ''}`)),
      h('strong', { class: 'num' }, money(p.amount)))))
      : h('p', { class: 'empty' }, 'Sin cobros registrados todavía.'));
}

function render() {
  const scroll = window.scrollY;
  app.replaceChildren(
    h('header', { class: 'bar' }, h('div', { class: 'wrap' },
      h('a', { class: 'brand', href: '/' }, h('i'), 'Agendo', h('small', {}, 'Dueño')),
      h('button', { class: 'btn sm', onclick: logout }, 'Salir'))),
    h('main', { class: 'wrap page' }, kpis(), h('div', { class: 'two' }, chart(), paymentsList()), clientsTable()));
  window.scrollTo(0, scroll);
}

(async () => { try { await load(); } catch { showLogin(); } })();
