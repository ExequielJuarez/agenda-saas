// Horarios libres y reservas de cada negocio. Un servicio de 60 min ocupa 2 casilleros de 30.
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

// Casilleros que ocupa un turno que empieza en "hora" y dura "minutos".
const casilleros = (hora, minutos, paso) =>
  Array.from({ length: Math.max(1, Math.ceil(minutos / paso)) }, (_, i) => deMin(aMin(hora) + i * paso));

// Casilleros ocupados de un día. Con transacción, bloquea los turnos para evitar reservas simultáneas.
async function ocupacion(negocio, fecha, t) {
  const turnos = await db.Turno.findAll({
    where: { negocio_id: negocio.id, fecha, estado: { [Op.ne]: "cancelled" } },
    transaction: t,
    lock: t ? t.LOCK.UPDATE : undefined,
  });
  const paso = negocio.ajustes.step;
  const set = new Set();
  turnos.forEach((x) => casilleros(x.hora, x.duracion || paso, paso).forEach((c) => set.add(c)));
  return set;
}

function libresDesde(negocio, fecha, ocupados, minutos) {
  const a = negocio.ajustes;
  if (!a.days.includes(new Date(fecha + "T00:00:00").getDay())) return [];
  const largo = Math.max(1, Math.ceil((minutos || a.step) / a.step)) * a.step;
  const out = [];
  for (let m = aMin(a.from); m + largo <= aMin(a.to); m += a.step) {
    const hora = deMin(m);
    if (!pasado(fecha, hora) && casilleros(hora, minutos || a.step, a.step).every((c) => !ocupados.has(c))) out.push(hora);
  }
  return out;
}

async function horasLibres(negocio, fecha, servicioId) {
  const servicio = servicioId ? await db.Servicio.findOne({ where: { id: servicioId, negocio_id: negocio.id, activo: true } }) : null;
  return libresDesde(negocio, fecha, await ocupacion(negocio, fecha), servicio ? servicio.minutos : negocio.ajustes.step);
}

// soloLibres = true (reservas web): exige que el horario esté dentro de la atención y libre.
// Turnos manuales del dueño: solo se valida que no se superponga con otro turno.
async function crearTurno(negocio, datos, { origen, estado, soloLibres }) {
  const servicio = datos.servicioId ? await db.Servicio.findOne({ where: { id: datos.servicioId, negocio_id: negocio.id, activo: true } }) : null;
  if (soloLibres && !servicio) {
    const err = new Error("Servicio inválido");
    err.status = 400;
    throw err;
  }
  const paso = negocio.ajustes.step;
  const minutos = servicio ? servicio.minutos : paso;
  return db.sequelize.transaction(async (t) => {
    const ocupados = await ocupacion(negocio, datos.fecha, t);
    const choca = casilleros(datos.hora, minutos, paso).some((c) => ocupados.has(c));
    const fuera = soloLibres && !libresDesde(negocio, datos.fecha, ocupados, minutos).includes(datos.hora);
    if (choca || fuera) {
      const err = new Error(origen === "web" ? "Ese horario ya no está disponible" : "Ese horario ya está ocupado");
      err.status = 409;
      throw err;
    }
    return db.Turno.create(
      { negocio_id: negocio.id, nombre: datos.nombre, telefono: datos.telefono || "", servicio: servicio ? servicio.nombre : "Turno", duracion: minutos, precio: servicio ? servicio.precio : 0, fecha: datos.fecha, hora: datos.hora, estado, origen },
      { transaction: t }
    );
  });
}

const aJson = (t) => ({ id: t.id, name: t.nombre, phone: t.telefono, service: t.servicio, price: t.precio, minutes: t.duracion, date: t.fecha, time: t.hora, status: t.estado, source: t.origen });
const servicioJson = (s) => ({ id: s.id, category: s.categoria, name: s.nombre, price: s.precio, minutes: s.minutos, desc: s.descripcion });

const serviciosActivos = (negocio) => db.Servicio.findAll({ where: { negocio_id: negocio.id, activo: true }, order: [["categoria", "ASC"], ["id", "ASC"]] });

module.exports = { horasLibres, crearTurno, aJson, servicioJson, serviciosActivos };
