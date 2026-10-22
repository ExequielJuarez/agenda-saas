// Panel de cada cliente: su agenda, servicios, clientes, ajustes y suscripción.
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const db = require("../model/database/models");
const agendo = require("../config/agendo");
const suscripcion = require("../services/suscripcionService");
const agenda = require("../services/agendaService");
const recordatorios = require("../services/recordatorioService");
const { registrarFallo, limpiarFallos } = require("../middlewares/auth");

const limpio = (s, max) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

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
    res.json({
      tenant: suscripcion.aJson(req.negocio, req.sub), usable: suscripcion.puedeUsar(req.sub), whatsapp: agendo.whatsappDueno, brand: agendo.marca,
      autoReminders: recordatorios.automaticoDisponible(), defaultReminderText: recordatorios.MENSAJE_BASE,
    });
  },

  // ----- recordatorios -----
  async recordatorios(req, res) {
    const turnos = await recordatorios.proximos(req.negocio);
    res.json({ reminders: turnos.map((t) => recordatorios.aJson(t, req.negocio)) });
  },

  async marcarRecordatorio(req, res) {
    const turno = await db.Turno.findOne({ where: { id: req.params.id, negocio_id: req.negocio.id } });
    if (!turno) return res.status(404).json({ error: "No existe" });
    if (req.body.sent === false) await turno.update({ recordatorio_en: null, recordatorio_error: null });
    else await recordatorios.marcarEnviado(turno);
    res.json({ ok: true });
  },

  async turnos(req, res) {
    const desde = req.query.from || suscripcion.hoy();
    const hasta = req.query.to || suscripcion.sumarDias(desde, 60);
    const turnos = await db.Turno.findAll({ where: { negocio_id: req.negocio.id, fecha: { [Op.between]: [desde, hasta] } }, order: [["fecha", "ASC"], ["hora", "ASC"]] });
    res.json({ appointments: turnos.map(agenda.aJson) });
  },

  async estadisticas(req, res) {
    const hoy = suscripcion.hoy(), semana = suscripcion.sumarDias(hoy, 7), mes = hoy.slice(0, 7);
    const todos = await db.Turno.findAll({ where: { negocio_id: req.negocio.id } });
    const vigentes = todos.filter((t) => t.estado !== "cancelled");
    const clientes = new Map();
    todos.forEach((t) => {
      const k = t.telefono.replace(/\D/g, "") || t.nombre;
      const c = clientes.get(k) || { name: t.nombre, phone: t.telefono, visits: 0, spent: 0, last: "" };
      if (t.estado !== "cancelled") c.visits += 1;
      if (t.estado === "done") c.spent += t.precio;
      if (t.fecha > c.last) { c.last = t.fecha; c.name = t.nombre; }
      clientes.set(k, c);
    });
    res.json({
      today: vigentes.filter((t) => t.fecha === hoy).length,
      pending: todos.filter((t) => t.estado === "pending" && t.fecha >= hoy).length,
      week: vigentes.filter((t) => t.fecha >= hoy && t.fecha <= semana).length,
      // Ingresos del mes: turnos ya atendidos (cobrados) y los que están confirmados por atender
      monthIncome: todos.filter((t) => t.estado === "done" && t.fecha.startsWith(mes)).reduce((s, t) => s + t.precio, 0),
      monthExpected: todos.filter((t) => t.estado === "confirmed" && t.fecha.startsWith(mes)).reduce((s, t) => s + t.precio, 0),
      clients: [...clientes.values()].sort((a, b) => b.last.localeCompare(a.last)),
    });
  },

  async horarios(req, res) {
    res.json({ times: await agenda.horasLibres(req.negocio, req.query.date, req.query.service) });
  },

  async crearTurno(req, res) {
    const { name, phone, serviceId, date, time } = req.body;
    const turno = await agenda.crearTurno(req.negocio, { nombre: name, telefono: phone, servicioId: serviceId, fecha: date, hora: time }, { origen: "manual", estado: "confirmed", soloLibres: false });
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

  // ----- servicios y categorías -----
  async servicios(req, res) {
    res.json({ services: (await agenda.serviciosActivos(req.negocio)).map(agenda.servicioJson) });
  },

  async crearServicio(req, res) {
    const b = req.body;
    const s = await db.Servicio.create({
      negocio_id: req.negocio.id, categoria: limpio(b.category, 60) || "General", nombre: limpio(b.name, 80),
      precio: Math.round(Number(b.price) || 0), minutos: Number(b.minutes), descripcion: limpio(b.desc, 300),
    });
    res.status(201).json({ service: agenda.servicioJson(s) });
  },

  async editarServicio(req, res) {
    const s = await db.Servicio.findOne({ where: { id: req.params.id, negocio_id: req.negocio.id, activo: true } });
    if (!s) return res.status(404).json({ error: "No existe" });
    const b = req.body;
    await s.update({ categoria: limpio(b.category, 60) || "General", nombre: limpio(b.name, 80), precio: Math.round(Number(b.price) || 0), minutos: Number(b.minutes), descripcion: limpio(b.desc, 300) });
    res.json({ service: agenda.servicioJson(s) });
  },

  // Se desactiva en lugar de borrar: los turnos viejos conservan su nombre y precio.
  async borrarServicio(req, res) {
    if ((await db.Servicio.count({ where: { negocio_id: req.negocio.id, activo: true } })) <= 1) return res.status(409).json({ error: "Tiene que quedar al menos un servicio" });
    const s = await db.Servicio.findOne({ where: { id: req.params.id, negocio_id: req.negocio.id, activo: true } });
    if (!s) return res.status(404).json({ error: "No existe" });
    await s.update({ activo: false });
    res.json({ ok: true });
  },

  async guardarAjustes(req, res) {
    const b = req.body;
    const ajustes = { days: [...new Set(b.days.map(Number).filter((d) => d >= 0 && d <= 6))], from: b.from, to: b.to, step: Number(b.step) };
    await req.negocio.update({
      ajustes,
      whatsapp: limpio(b.whatsapp, 30),
      ...(b.businessName ? { nombre: limpio(b.businessName, 80) } : {}),
      ...("reminderText" in b ? { mensaje_recordatorio: limpio(b.reminderText, 400) } : {}),
      // El envío automático solo se puede activar si el servidor tiene la API de WhatsApp configurada
      ...("reminderAuto" in b ? { recordatorios_auto: !!b.reminderAuto && recordatorios.automaticoDisponible() } : {}),
    });
    res.json({ tenant: suscripcion.aJson(req.negocio, req.sub) });
  },
};
