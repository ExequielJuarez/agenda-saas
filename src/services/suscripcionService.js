// Estado de la suscripción de cada negocio, cobros y métricas del dueño.
const { Op, fn, col } = require("sequelize");
const db = require("../model/database/models");
const agendo = require("../config/agendo");

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoy = () => ymd(new Date());
const sumarDias = (fecha, n) => {
  const d = new Date(fecha + "T00:00:00");
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const sumarMes = (fecha) => {
  const d = new Date(fecha + "T00:00:00");
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return ymd(d);
};

// trial (prueba) · active (al día) · overdue (vencido, en gracia) · blocked (bloqueado) · suspended (suspendido por vos)
function estado(negocio, tienePagos) {
  const t0 = hoy();
  let state;
  if (negocio.suspendido) state = "suspended";
  else if (negocio.vence >= t0) state = tienePagos ? "active" : "trial";
  else if (sumarDias(negocio.vence, agendo.diasGracia) >= t0) state = "overdue";
  else state = "blocked";
  const daysLeft = Math.round((new Date(negocio.vence + "T00:00:00") - new Date(t0 + "T00:00:00")) / 86400000);
  return { state, paidUntil: negocio.vence, daysLeft };
}
const puedeUsar = (sub) => ["trial", "active", "overdue"].includes(sub.state);

const tienePagos = async (negocio) => (await db.Pago.count({ where: { negocio_id: negocio.id } })) > 0;

async function suscripcionDe(negocio) {
  return estado(negocio, await tienePagos(negocio));
}

const aJson = (n, sub) => ({
  id: n.id, slug: n.slug, businessName: n.nombre, email: n.email, price: n.precio, payLink: n.link_pago,
  whatsapp: n.whatsapp, settings: n.ajustes, subscription: sub,
});

// Suma un mes al vencimiento y reactiva la cuenta.
async function registrarPago(negocio, { monto, medio, nota }) {
  const base = negocio.vence > hoy() ? negocio.vence : hoy();
  await negocio.update({ vence: sumarMes(base), suspendido: false });
  return db.Pago.create({ negocio_id: negocio.id, monto, medio: medio || "Transferencia", nota: nota || "", fecha: hoy() });
}

async function resumen() {
  const [negocios, pagos, turnos] = await Promise.all([
    db.Negocio.findAll(),
    db.Pago.findAll({ order: [["fecha", "DESC"], ["id", "DESC"]] }),
    db.Turno.findAll({ attributes: ["negocio_id", [fn("COUNT", col("id")), "n"]], group: ["negocio_id"], raw: true }),
  ]);
  const conPagos = new Set(pagos.map((p) => p.negocio_id));
  const cantTurnos = Object.fromEntries(turnos.map((t) => [t.negocio_id, Number(t.n)]));
  const ultimoPago = {};
  pagos.forEach((p) => { if (!ultimoPago[p.negocio_id]) ultimoPago[p.negocio_id] = p; });

  const filas = negocios.map((n) => ({
    ...aJson(n, estado(n, conPagos.has(n.id))),
    createdAt: ymd(n.creado_en),
    lastPayment: ultimoPago[n.id] ? { date: ultimoPago[n.id].fecha, amount: ultimoPago[n.id].monto } : null,
    appointments: cantTurnos[n.id] || 0,
  }));
  const cuenta = (s) => filas.filter((f) => f.subscription.state === s).length;
  const mes = hoy().slice(0, 7);
  const suma = (lista) => lista.reduce((s, p) => s + p.monto, 0);

  const meses = [];
  const ahora = new Date();
  for (let i = 5; i >= 0; i--) {
    const m = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const key = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
    meses.push({ month: key, total: suma(pagos.filter((p) => p.fecha.startsWith(key))) });
  }

  const nombres = Object.fromEntries(negocios.map((n) => [n.id, n.nombre]));
  return {
    kpis: {
      mrr: filas.filter((f) => f.subscription.state === "active").reduce((s, f) => s + f.price, 0),
      active: cuenta("active"), trial: cuenta("trial"), overdue: cuenta("overdue"), blocked: cuenta("blocked") + cuenta("suspended"),
      total: filas.length,
      monthRevenue: suma(pagos.filter((p) => p.fecha.startsWith(mes))),
      allTime: suma(pagos),
      pending: filas.filter((f) => f.subscription.state === "overdue").reduce((s, f) => s + f.price, 0),
      upcoming: filas.filter((f) => ["active", "trial"].includes(f.subscription.state) && f.subscription.daysLeft <= 5).length,
      appointments: Object.values(cantTurnos).reduce((s, n) => s + n, 0),
    },
    months: meses,
    tenants: filas.sort((a, b) => a.subscription.paidUntil.localeCompare(b.subscription.paidUntil)),
    payments: pagos.slice(0, 30).map((p) => ({ id: p.id, amount: p.monto, method: p.medio, note: p.nota, date: p.fecha, businessName: nombres[p.negocio_id] || "(eliminado)" })),
    defaults: { price: agendo.precio, currency: agendo.moneda, trialDays: agendo.diasPrueba },
  };
}

module.exports = { hoy, ymd, sumarDias, sumarMes, estado, puedeUsar, suscripcionDe, aJson, registrarPago, resumen };
