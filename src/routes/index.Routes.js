const express = require("express");
const { body, query } = require("express-validator");
const agendo = require("../config/agendo");
const validar = require("../middlewares/validar");
const { negocioPublico } = require("../middlewares/auth");
const publicController = require("../controllers/publicController");

const router = express.Router();
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Páginas
router.get("/", (req, res) => res.render("index", { agendo }));
router.get("/owner", (req, res) => res.render("owner"));
router.get("/app", (req, res) => res.render("app"));
router.get("/b/:slug", (req, res) => res.render("book"));

// Datos públicos de la marca (precio, prueba gratis y WhatsApp para la landing)
router.get("/api/config", (req, res) =>
  res.json({ brand: agendo.marca, price: agendo.precio, currency: agendo.moneda, trialDays: agendo.diasPrueba, whatsapp: agendo.whatsappDueno })
);

// Reservas públicas de cada negocio
const publico = express.Router({ mergeParams: true });
publico.use(negocioPublico);
publico.get("/", publicController.info);
publico.get("/slots", query("date").matches(FECHA).withMessage("Fecha inválida"), query("service").optional({ values: "falsy" }).isInt().withMessage("Servicio inválido"), validar, publicController.horarios);
publico.post(
  "/book",
  body("name").trim().notEmpty().withMessage("Completá tu nombre").isLength({ max: 80 }).withMessage("Nombre demasiado largo"),
  body("phone").trim().custom((v) => String(v).replace(/\D/g, "").length >= 8).withMessage("Ingresá un teléfono válido"),
  body("serviceId").isInt().withMessage("Elegí un servicio"),
  body("date").matches(FECHA).withMessage("Fecha inválida"),
  body("time").matches(/^\d{2}:\d{2}$/).withMessage("Hora inválida"),
  validar,
  publicController.reservar
);
router.use("/api/public/:slug", publico);

module.exports = router;
