const db = require("../model/database/models");
const suscripcion = require("../services/suscripcionService");

// Freno contra fuerza bruta: 10 intentos fallidos por IP cada 15 minutos.
const intentos = new Map();
const limitarIntentos = (req, res, next) => {
  const a = intentos.get(req.ip);
  if (a && a.n >= 10 && Date.now() < a.hasta) return res.status(429).json({ error: "Demasiados intentos, probá más tarde" });
  next();
};
const registrarFallo = (ip) => {
  const a = intentos.get(ip) || { n: 0 };
  intentos.set(ip, { n: a.n + 1, hasta: Date.now() + 15 * 60 * 1000 });
};
const limpiarFallos = (ip) => intentos.delete(ip);

// Panel del dueño
const soloDueno = (req, res, next) => (req.session.dueno ? next() : res.status(401).json({ error: "No autorizado" }));

// Panel del cliente: carga su negocio. Si la suscripción está pausada, solo deja ver /me.
const soloCliente = async (req, res, next) => {
  const negocio = req.session.negocioId && (await db.Negocio.findByPk(req.session.negocioId));
  if (!negocio) return res.status(401).json({ error: "No autorizado" });
  req.negocio = negocio;
  req.sub = await suscripcion.suscripcionDe(negocio);
  next();
};
const suscripcionActiva = (req, res, next) =>
  suscripcion.puedeUsar(req.sub) ? next() : res.status(402).json({ error: "Tu suscripción está vencida. Regularizá el pago para seguir usando Agendo." });

// Reservas públicas: /api/public/:slug
const negocioPublico = async (req, res, next) => {
  const negocio = await db.Negocio.findOne({ where: { slug: req.params.slug } });
  if (!negocio) return res.status(404).json({ error: "Negocio no encontrado" });
  if (!suscripcion.puedeUsar(await suscripcion.suscripcionDe(negocio))) return res.status(403).json({ error: "Las reservas online no están disponibles por el momento" });
  req.negocio = negocio;
  next();
};

module.exports = { limitarIntentos, registrarFallo, limpiarFallos, soloDueno, soloCliente, suscripcionActiva, negocioPublico };
