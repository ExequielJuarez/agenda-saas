// Panel del dueño: login, clientes, cobros y métricas.
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../model/database/models");
const suscripcion = require("../services/suscripcionService");
const negocioService = require("../services/negocioService");
const { registrarFallo, limpiarFallos } = require("../middlewares/auth");

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
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
    const { businessName, email, password, payLink, rubro, price } = req.body;
    try {
      const negocio = await negocioService.crear({ nombre: businessName, email, password, rubro, precio: price, linkPago: payLink });
      res.status(201).json({ tenant: await conSuscripcion(negocio) });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }
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
    await negocio.destroy(); // borra también sus pagos, servicios y turnos (ON DELETE CASCADE)
    res.json({ ok: true });
  },
};
