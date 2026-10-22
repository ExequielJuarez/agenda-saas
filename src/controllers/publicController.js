// Reservas públicas de cada negocio (/b/<slug>).
const agenda = require("../services/agendaService");
const rubros = require("../config/rubros");

module.exports = {
  async info(req, res) {
    const servicios = await agenda.serviciosActivos(req.negocio);
    res.json({ name: req.negocio.nombre, whatsapp: req.negocio.whatsapp, terms: rubros.obtener(req.negocio.rubro).terminos, services: servicios.map(agenda.servicioJson) });
  },

  async horarios(req, res) {
    res.json({ times: await agenda.horasLibres(req.negocio, req.query.date, req.query.service) });
  },

  async reservar(req, res) {
    const { name, phone, serviceId, date, time } = req.body;
    try {
      const turno = await agenda.crearTurno(req.negocio, { nombre: name, telefono: phone, servicioId: serviceId, fecha: date, hora: time }, { origen: "web", estado: "pending", soloLibres: true });
      res.status(201).json({ ok: true, booking: { service: turno.servicio, price: turno.precio, date: turno.fecha, time: turno.hora } });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  },
};
