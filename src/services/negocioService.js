// Alta de negocios (la usan el panel del dueño y el registro público).
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../model/database/models");
const agendo = require("../config/agendo");
const rubros = require("../config/rubros");
const suscripcion = require("./suscripcionService");

const slugify = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "negocio";

const sembrarServicios = (negocioId, rubro) =>
  db.Servicio.bulkCreate(rubros.obtener(rubro).servicios.map((x) => ({ negocio_id: negocioId, categoria: x.categoria, nombre: x.nombre, precio: x.precio, minutos: x.minutos, descripcion: x.descripcion })));

// Crea el negocio con la prueba gratis, el horario típico del rubro y sus servicios sugeridos.
async function crear({ nombre, email, password, rubro, precio, linkPago }) {
  const r = rubros.obtener(rubro);
  email = email.toLowerCase();
  if (await db.Negocio.findOne({ where: { email } })) {
    const err = new Error("Ya existe una cuenta con ese email");
    err.status = 409;
    throw err;
  }
  let slug = slugify(nombre);
  while (await db.Negocio.findOne({ where: { slug } })) slug += "-" + crypto.randomInt(10, 99);
  const negocio = await db.Negocio.create({
    slug, nombre, email, password_hash: bcrypt.hashSync(password, 10), rubro: r.id,
    precio: Number(precio) > 0 ? Math.round(Number(precio)) : agendo.precio,
    link_pago: linkPago || "", vence: suscripcion.sumarDias(suscripcion.hoy(), agendo.diasPrueba),
    ajustes: { days: r.horario.days, from: r.horario.from, to: r.horario.to, step: r.horario.step },
  });
  await sembrarServicios(negocio.id, r.id);
  return negocio;
}

// Agrega los servicios sugeridos del rubro que el negocio todavía no tiene (por nombre).
async function agregarSugeridos(negocio) {
  const existentes = new Set((await db.Servicio.findAll({ where: { negocio_id: negocio.id, activo: true } })).map((s) => s.nombre.toLowerCase()));
  const nuevos = rubros.obtener(negocio.rubro).servicios.filter((x) => !existentes.has(x.nombre.toLowerCase()));
  if (nuevos.length) await db.Servicio.bulkCreate(nuevos.map((x) => ({ negocio_id: negocio.id, categoria: x.categoria, nombre: x.nombre, precio: x.precio, minutos: x.minutos, descripcion: x.descripcion })));
  return nuevos.length;
}

module.exports = { crear, agregarSugeridos };
