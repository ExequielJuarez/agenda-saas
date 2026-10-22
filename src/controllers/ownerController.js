// Panel del dueño: login, clientes, cobros y métricas.
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../model/database/models");
const agendo = require("../config/agendo");
const suscripcion = require("../services/suscripcionService");
const { registrarFallo, limpiarFallos } = require("../middlewares/auth");

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const slugify = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "negocio";
const ajustesIniciales = () => ({ days: [1, 2, 3, 4, 5, 6], from: "09:00", to: "18:00", step: 30 });

const conSuscripcion = async (negocio) => suscripcion.aJson(negocio, await suscripcion.suscripcionDe(negocio));

module.exports = {
  login(req, res) {
    const clave = process.env.OWNER_PASSWORD || "cambiar-esta-clave";
    if (!crypto.timingSafeEqual(sha(req.body.password), sha(clave))) {
      registrarFallo(req.ip);
      return res.status(401).json({ error: "Contraseña incorrecta" });
    }
    limpiarFallos(req.ip);
    req.session.regenerate((err) => {
      if (err) throw err;
      req.session.dueno = true;
      res.json({ ok: true });
    });
  },

  logout(req, res) {
    req.session.destroy(() => res.json({ ok: true }));
  },

  async resumen(req, res) {
    res.json(await suscripcion.resumen());
  },

  async crearCliente(req, res) {
    const { businessName, email, password, payLink } = req.body;
    if (await db.Negocio.findOne({ where: { email: email.toLowerCase() } })) return res.status(409).json({ error: "Ya existe un cliente con ese email" });
    let slug = slugify(businessName);
    while (await db.Negocio.findOne({ where: { slug } })) slug += "-" + crypto.randomInt(10, 99);
    const negocio = await db.Negocio.create({
      slug, nombre: businessName, email: email.toLowerCase(), password_hash: bcrypt.hashSync(password, 10),
      precio: Number(req.body.price) > 0 ? Math.round(Number(req.body.price)) : agendo.precio,
      link_pago: payLink || "", vence: suscripcion.sumarDias(suscripcion.hoy(), agendo.diasPrueba), ajustes: ajustesIniciales(),
    });
    // Servicio de arranque: el cliente lo edita o agrega los suyos desde su panel
    await db.Servicio.create({ negocio_id: negocio.id, categoria: "General", nombre: "Turno general", precio: 0, minutos: 30 });
    res.status(201).json({ tenant: await conSuscripcion(negocio) });
  },

  async registrarPago(req, res) {
    const negocio = await db.Negocio.findByPk(req.params.id);
    if (!negocio) return res.status(404).json({ error: "No existe" });
    const monto = Math.round(Number(req.body.amount) || negocio.precio);
    await suscripcion.registrarPago(negocio, { monto, medio: req.body.method, nota: req.body.note });
    res.status(201).json({ tenant: await conSuscripcion(negocio) });
  },

  async editar(req, res) {
    const negocio = await db.Negocio.findByPk(req.params.id);
    if (!negocio) return res.status(404).json({ error: "No existe" });
    const b = req.body, cambios = {};
    if ("suspended" in b) cambios.suspendido = !!b.suspended;
    if (Number(b.price) > 0) cambios.precio = Math.round(Number(b.price));
    if ("payLink" in b) cambios.link_pago = b.payLink || "";
    if (b.businessName) cambios.nombre = b.businessName;
    if (b.password && String(b.password).length >= 6) cambios.password_hash = bcrypt.hashSync(String(b.password), 10);
    await negocio.update(cambios);
    res.json({ tenant: await conSuscripcion(negocio) });
  },

  async eliminar(req, res) {
    const negocio = await db.Negocio.findByPk(req.params.id);
    if (!negocio) return res.status(404).json({ error: "No existe" });
    await negocio.destroy(); // borra también sus pagos y turnos (ON DELETE CASCADE)
    res.json({ ok: true });
  },
};
