// Recordatorios de turno por WhatsApp.
//  · Manual: el panel arma el mensaje y abre WhatsApp con un toque (gratis, funciona siempre).
//  · Automático: envía solo con la API de WhatsApp Cloud (Meta). Se activa con WA_TOKEN y WA_PHONE_ID en el .env.
const { Op } = require("sequelize");
const db = require("../model/database/models");
const suscripcion = require("./suscripcionService");

const MENSAJE_BASE = "Hola {nombre}! Te recordamos tu turno en {negocio}: {servicio}, {fecha} a las {hora} hs. Si no podés venir, avisanos por acá. ¡Te esperamos!";
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Ventana horaria de envío automático (hora local del servidor) y anticipación máxima/mínima.
const DESDE_HORA = Number(process.env.WA_HORA_DESDE ?? 8), HASTA_HORA = Number(process.env.WA_HORA_HASTA ?? 21);
const MAX_HORAS = 24, MIN_HORAS = 2;
const MAX_REINTENTOS_ERROR = 3;

const automaticoDisponible = () => !!(process.env.WA_TOKEN && process.env.WA_PHONE_ID) || process.env.WA_DRY_RUN === "true";

const fechaLarga = (f) => {
  const d = new Date(f + "T00:00:00");
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
};
const inicio = (t) => new Date(`${t.fecha}T${t.hora}:00`);

function texto(negocio, turno) {
  const plantilla = negocio.mensaje_recordatorio || MENSAJE_BASE;
  const valores = { nombre: turno.nombre, negocio: negocio.nombre, servicio: turno.servicio, fecha: fechaLarga(turno.fecha), hora: turno.hora };
  return plantilla.replace(/\{(\w+)\}/g, (m, k) => (k in valores ? valores[k] : m));
}

// Número para WhatsApp: solo dígitos; si parece local argentino (10 dígitos) agrega 549.
function numeroWa(raw) {
  let d = String(raw).replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 10) d = "549" + d;
  return d;
}

// Turnos de hoy y mañana que todavía no pasaron y no están cancelados ni atendidos.
async function proximos(negocio) {
  const hoy = suscripcion.hoy(), manana = suscripcion.sumarDias(hoy, 1);
  const turnos = await db.Turno.findAll({
    where: { negocio_id: negocio.id, fecha: { [Op.between]: [hoy, manana] }, estado: { [Op.in]: ["pending", "confirmed"] }, telefono: { [Op.ne]: "" } },
    order: [["fecha", "ASC"], ["hora", "ASC"]],
  });
  const ahora = new Date();
  return turnos.filter((t) => inicio(t) > ahora);
}

async function marcarEnviado(turno) {
  await turno.update({ recordatorio_en: new Date(), recordatorio_error: null });
}

// ----- envío automático (WhatsApp Cloud API) -----
// Fuera de las 24 hs de conversación, WhatsApp exige una plantilla aprobada con 5 variables:
// {{1}} nombre · {{2}} negocio · {{3}} servicio · {{4}} fecha · {{5}} hora
async function enviarPlantilla(para, turno, negocio) {
  const params = [turno.nombre, negocio.nombre, turno.servicio, fechaLarga(turno.fecha), turno.hora];
  if (process.env.WA_DRY_RUN === "true") {
    console.log(`📨 [DRY-RUN] a ${para}: ${params.join(" | ")}`);
    return;
  }
  const version = process.env.WA_API_VERSION || "v21.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${process.env.WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: para,
      type: "template",
      template: {
        name: process.env.WA_TEMPLATE || "recordatorio_turno",
        language: { code: process.env.WA_LANG || "es_AR" },
        components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
      },
    }),
  });
  if (!res.ok) {
    const cuerpo = await res.json().catch(() => ({}));
    throw new Error(cuerpo?.error?.message || `HTTP ${res.status}`);
  }
}

let enCurso = false;
async function enviarAutomaticos() {
  if (!automaticoDisponible() || enCurso) return { enviados: 0, errores: 0 };
  const hora = new Date().getHours();
  if (hora < DESDE_HORA || hora >= HASTA_HORA) return { enviados: 0, errores: 0 };
  enCurso = true;
  let enviados = 0, errores = 0;
  try {
    const negocios = await db.Negocio.findAll({ where: { recordatorios_auto: true } });
    for (const negocio of negocios) {
      if (!suscripcion.puedeUsar(await suscripcion.suscripcionDe(negocio))) continue;
      for (const turno of await proximos(negocio)) {
        const horas = (inicio(turno) - new Date()) / 3600000;
        const fallos = Number((turno.recordatorio_error || "").split("|")[0]) || 0;
        if (turno.recordatorio_en || horas > MAX_HORAS || horas < MIN_HORAS || fallos >= MAX_REINTENTOS_ERROR) continue;
        try {
          await enviarPlantilla(numeroWa(turno.telefono), turno, negocio);
          await marcarEnviado(turno);
          enviados++;
        } catch (e) {
          errores++;
          // Tras varios fallos seguidos se deja de insistir y queda para envío manual
          await turno.update({ recordatorio_error: `${fallos + 1}|${e.message}`.slice(0, 200) });
          console.error(`❌ Recordatorio turno ${turno.id}:`, e.message);
        }
      }
    }
  } finally {
    enCurso = false;
  }
  if (enviados || errores) console.log(`📨 Recordatorios automáticos: ${enviados} enviados, ${errores} con error`);
  return { enviados, errores };
}

// Revisa cada 15 minutos (el filtro por turno evita duplicados).
function programar() {
  if (!automaticoDisponible()) return false;
  require("node-cron").schedule("*/15 * * * *", () => enviarAutomaticos().catch((e) => console.error("❌ Recordatorios:", e.message)));
  return true;
}

const aJson = (t, negocio) => {
  const [n, msg] = (t.recordatorio_error || "").split("|");
  return {
    id: t.id, name: t.nombre, phone: t.telefono, service: t.servicio, date: t.fecha, time: t.hora, status: t.estado,
    sentAt: t.recordatorio_en, error: t.recordatorio_error ? (msg || n) : null,
    text: texto(negocio, t), waNumber: numeroWa(t.telefono),
  };
};

module.exports = { MENSAJE_BASE, automaticoDisponible, texto, numeroWa, proximos, marcarEnviado, enviarAutomaticos, programar, aJson };
