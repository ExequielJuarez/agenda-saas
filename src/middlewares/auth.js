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

// Freno para altas públicas: 5 cuentas nuevas por IP por hora (evita spam de registros).
const altas = new Map();
const limitarRegistros = (req, res, next) => {
  const ahora = Date.now();
  const recientes = (altas.get(req.ip) || []).filter((t) => ahora - t < 60 * 60 * 1000);
  if (recientes.length >= 5) return res.status(429).json({ error: "Creaste demasiadas cuentas desde esta conexión. Probá más tarde." });
  recientes.push(ahora);
  altas.set(req.ip, recientes);
  next();
};

// Panel del dueño
const soloDueno = (req, res, next) => (req.session.dueno ? next() : res.status(401).json({ error: "No autorizado" }));

// Panel del cliente: carga su negocio y el estado de su suscripción.
const soloCliente = async (req, res, next) => {
  const negocio = req.session.negocioId && (await db.Negocio.findByPk(req.session.negocioId));
  if (!negocio) return res.status(401).json({ error: "No autorizado" });
  req.negocio = negocio;
  req.sub = await suscripcion.suscripcionDe(negocio);
  req.acceso = suscripcion.acceso(req.sub);
  next();
};

// Con la prueba o el pago vencido, el cliente puede VER todo (GET) pero no cargar ni modificar nada.
// Si el dueño lo suspendió, no puede hacer nada.
const accesoSegunSuscripcion = (req, res, next) => {
  if (req.acceso === "full") return next();
  if (req.acceso === "readonly" && req.method === "GET") return next();
  const error =
    req.acceso === "readonly"
      ? "Tu prueba o suscripción terminó. Tus datos están guardados: pagá para volver a cargar turnos y recibir reservas."
      : "Tu cuenta está suspendida. Escribinos para reactivarla.";
  res.status(402).json({ error });
};

// Reservas públicas: /api/public/:slug
const negocioPublico = async (req, res, next) => {
  const negocio = await db.Negocio.findOne({ where: { slug: req.params.slug } });
  if (!negocio) return res.status(404).json({ error: "Negocio no encontrado" });
  if (!suscripcion.puedeUsar(await suscripcion.suscripcionDe(negocio))) return res.status(403).json({ error: "Las reservas online no están disponibles por el momento" });
  req.negocio = negocio;
  next();
};

module.exports = { limitarIntentos, registrarFallo, limpiarFallos, limitarRegistros, soloDueno, soloCliente, accesoSegunSuscripcion, negocioPublico };
