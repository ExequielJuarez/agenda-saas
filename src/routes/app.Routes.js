// API del panel de cada cliente: /api/app/*
const express = require("express");
const { body, query, param } = require("express-validator");
const appController = require("../controllers/appController");
const validar = require("../middlewares/validar");
const { limitarIntentos, soloCliente, suscripcionActiva } = require("../middlewares/auth");

const router = express.Router();
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;
const aMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

router.post(
  "/login", limitarIntentos,
  body("email").trim().isEmail().withMessage("Ingresá un email válido"),
  body("password").notEmpty().withMessage("Ingresá la contraseña"),
  validar,
  appController.login
);
router.post("/logout", appController.logout);

router.use(soloCliente);
router.get("/me", appController.me);

// Desde acá, solo con suscripción vigente
router.use(suscripcionActiva);
router.get("/appointments", appController.turnos);
router.get("/stats", appController.estadisticas);
router.get("/slots", query("date").matches(FECHA).withMessage("Fecha inválida"), validar, appController.horarios);
router.post(
  "/appointments",
  body("name").trim().notEmpty().withMessage("Completá el nombre del cliente").isLength({ max: 80 }).withMessage("Nombre demasiado largo"),
  body("date").matches(FECHA).withMessage("Fecha inválida"),
  body("time").matches(HORA).withMessage("Elegí un horario"),
  validar,
  appController.crearTurno
);
const id = param("id").isInt().withMessage("Turno inválido");
router.patch("/appointments/:id", id, body("status").isIn(["pending", "confirmed", "done", "cancelled"]).withMessage("Estado inválido"), validar, appController.cambiarEstado);
router.delete("/appointments/:id", id, validar, appController.borrarTurno);
router.put(
  "/settings",
  body("days").isArray().withMessage("Elegí los días de atención"),
  body("from").matches(HORA).withMessage("Horario inválido"),
  body("to").matches(HORA).custom((to, { req }) => aMin(to) > aMin(req.body.from)).withMessage("Horario inválido"),
  body("step").isIn([15, 20, 30, 45, 60].map(String)).withMessage("Duración inválida"),
  body("services").isArray().withMessage("Servicios inválidos"),
  validar,
  appController.guardarAjustes
);

module.exports = router;
