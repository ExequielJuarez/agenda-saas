// Reservas públicas de cada negocio (/b/<slug>).
const agenda = require("../services/agendaService");

module.exports = {
  info(req, res) {
    res.json({ name: req.negocio.nombre, services: req.negocio.ajustes.services });
  },

  async horarios(req, res) {
    res.json({ times: await agenda.horasLibres(req.negocio, req.query.date) });
  },

  async reservar(req, res) {
    const { name, phone, service, date, time } = req.body;
    try {
      await agenda.crearTurno(req.negocio, { nombre: name, telefono: phone, servicio: service, fecha: date, hora: time }, { origen: "web", estado: "pending", soloLibres: true });
      res.status(201).json({ ok: true });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  },
};
