// Panel de cada cliente: su agenda, clientes, ajustes y suscripción.
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const db = require("../model/database/models");
const agendo = require("../config/agendo");
const suscripcion = require("../services/suscripcionService");
const agenda = require("../services/agendaService");
const { registrarFallo, limpiarFallos } = require("../middlewares/auth");

module.exports = {
  async login(req, res) {
    const negocio = await db.Negocio.findOne({ where: { email: req.body.email.toLowerCase() } });
    if (!negocio || !bcrypt.compareSync(String(req.body.password), negocio.password_hash)) {
      registrarFallo(req.ip);
      return res.status(401).json({ error: "Email o contraseña incorrectos" });
    }
    limpiarFallos(req.ip);
    req.session.regenerate((err) => {
      if (err) throw err;
      req.session.negocioId = negocio.id;
      res.json({ ok: true });
    });
  },

  logout(req, res) {
    req.session.destroy(() => res.json({ ok: true }));
  },

  me(req, res) {
    res.json({ tenant: suscripcion.aJson(req.negocio, req.sub), usable: suscripcion.puedeUsar(req.sub), whatsapp: agendo.whatsappDueno, brand: agendo.marca });
  },

  async turnos(req, res) {
    const desde = req.query.from || suscripcion.hoy();
    const hasta = req.query.to || suscripcion.sumarDias(desde, 60);
    const turnos = await db.Turno.findAll({ where: { negocio_id: req.negocio.id, fecha: { [Op.between]: [desde, hasta] } }, order: [["fecha", "ASC"], ["hora", "ASC"]] });
    res.json({ appointments: turnos.map(agenda.aJson) });
  },

  async estadisticas(req, res) {
    const hoy = suscripcion.hoy(), semana = suscripcion.sumarDias(hoy, 7);
    const todos = await db.Turno.findAll({ where: { negocio_id: req.negocio.id } });
    const vigentes = todos.filter((t) => t.estado !== "cancelled");
    const clientes = new Map();
    todos.forEach((t) => {
      const k = t.telefono.replace(/\D/g, "") || t.nombre;
      const c = clientes.get(k) || { name: t.nombre, phone: t.telefono, visits: 0, last: "" };
      if (t.estado !== "cancelled") c.visits += 1;
      if (t.fecha > c.last) { c.last = t.fecha; c.name = t.nombre; }
      clientes.set(k, c);
    });
    res.json({
      today: vigentes.filter((t) => t.fecha === hoy).length,
      pending: todos.filter((t) => t.estado === "pending" && t.fecha >= hoy).length,
      week: vigentes.filter((t) => t.fecha >= hoy && t.fecha <= semana).length,
      clients: [...clientes.values()].sort((a, b) => b.last.localeCompare(a.last)),
    });
  },

  async horarios(req, res) {
    res.json({ times: await agenda.horasLibres(req.negocio, req.query.date) });
  },

  async crearTurno(req, res) {
    const { name, phone, service, date, time } = req.body;
    const turno = await agenda.crearTurno(req.negocio, { nombre: name, telefono: phone, servicio: service, fecha: date, hora: time }, { origen: "manual", estado: "confirmed", soloLibres: false });
    res.status(201).json({ appointment: agenda.aJson(turno) });
  },

  async cambiarEstado(req, res) {
    const turno = await db.Turno.findOne({ where: { id: req.params.id, negocio_id: req.negocio.id } });
    if (!turno) return res.status(404).json({ error: "No existe" });
    await turno.update({ estado: req.body.status });
    res.json({ appointment: agenda.aJson(turno) });
  },

  async borrarTurno(req, res) {
    const n = await db.Turno.destroy({ where: { id: req.params.id, negocio_id: req.negocio.id } });
    n ? res.json({ ok: true }) : res.status(404).json({ error: "No existe" });
  },

  async guardarAjustes(req, res) {
    const b = req.body;
    const services = [...new Set((b.services || []).map((s) => String(s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 60)).filter(Boolean))].slice(0, 20);
    const ajustes = {
      days: [...new Set(b.days.map(Number).filter((d) => d >= 0 && d <= 6))],
      from: b.from, to: b.to, step: Number(b.step),
      services: services.length ? services : ["Turno general"],
    };
    await req.negocio.update({ ajustes, ...(b.businessName ? { nombre: String(b.businessName).trim().slice(0, 80) } : {}) });
    res.json({ tenant: suscripcion.aJson(req.negocio, req.sub) });
  },
};
