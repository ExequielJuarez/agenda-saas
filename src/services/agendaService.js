// Horarios libres y reservas de cada negocio.
const { Op } = require("sequelize");
const db = require("../model/database/models");
const { ymd } = require("./suscripcionService");

const pad = (n) => String(n).padStart(2, "0");
const aMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const deMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const pasado = (fecha, hora) => {
  const n = new Date();
  return `${fecha} ${hora}` <= `${ymd(n)} ${pad(n.getHours())}:${pad(n.getMinutes())}`;
};

async function horasLibres(negocio, fecha) {
  const a = negocio.ajustes;
  if (!a.days.includes(new Date(fecha + "T00:00:00").getDay())) return [];
  const ocupadas = new Set((await db.Turno.findAll({ where: { negocio_id: negocio.id, fecha, estado: { [Op.ne]: "cancelled" } }, attributes: ["hora"] })).map((t) => t.hora));
  const out = [];
  for (let m = aMin(a.from); m < aMin(a.to); m += a.step) {
    const hora = deMin(m);
    if (!ocupadas.has(hora) && !pasado(fecha, hora)) out.push(hora);
  }
  return out;
}

const ocupado = (negocio, fecha, hora, t) =>
  db.Turno.findOne({ where: { negocio_id: negocio.id, fecha, hora, estado: { [Op.ne]: "cancelled" } }, transaction: t, lock: t && t.LOCK.UPDATE });

// opciones.libre = true exige que el horario esté dentro de los horarios de atención (reservas web).
// Los turnos manuales del dueño solo validan que no esté ocupado.
async function crearTurno(negocio, datos, { origen, estado, soloLibres }) {
  return db.sequelize.transaction(async (t) => {
    const choca = await ocupado(negocio, datos.fecha, datos.hora, t);
    const fueraDeHorario = soloLibres && !(await horasLibres(negocio, datos.fecha)).includes(datos.hora);
    if (choca || fueraDeHorario) {
      const err = new Error(origen === "web" ? "Ese horario ya no está disponible" : "Ese horario ya está ocupado");
      err.status = 409;
      throw err;
    }
    const servicio = negocio.ajustes.services.includes(datos.servicio) ? datos.servicio : negocio.ajustes.services[0];
    return db.Turno.create({ negocio_id: negocio.id, nombre: datos.nombre, telefono: datos.telefono || "", servicio, fecha: datos.fecha, hora: datos.hora, estado, origen }, { transaction: t });
  });
}

const aJson = (t) => ({ id: t.id, name: t.nombre, phone: t.telefono, service: t.servicio, date: t.fecha, time: t.hora, status: t.estado, source: t.origen });

module.exports = { horasLibres, crearTurno, aJson };
