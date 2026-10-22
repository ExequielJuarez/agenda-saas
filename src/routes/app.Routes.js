// API del panel de cada cliente: /api/app/*
const express = require("express");
const { body, query, param } = require("express-validator");
const appController = require("../controllers/appController");
const validar = require("../middlewares/validar");
const { limitarIntentos, soloCliente, accesoSegunSuscripcion } = require("../middlewares/auth");
const rubros = require("../config/rubros");

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

// Desde acá: suscripción vigente = todo; vencida = solo lectura; suspendida = nada
router.use(accesoSegunSuscripcion);
router.get("/appointments", appController.turnos);
router.get("/stats", appController.estadisticas);
router.get("/slots", query("date").matches(FECHA).withMessage("Fecha inválida"), query("service").optional({ values: "falsy" }).isInt().withMessage("Servicio inválido"), validar, appController.horarios);
router.post(
  "/appointments",
  body("name").trim().notEmpty().withMessage("Completá el nombre del cliente").isLength({ max: 80 }).withMessage("Nombre demasiado largo"),
  body("date").matches(FECHA).withMessage("Fecha inválida"),
  body("time").matches(HORA).withMessage("Elegí un horario"),
  body("serviceId").optional({ values: "falsy" }).isInt().withMessage("Servicio inválido"),
  validar,
  appController.crearTurno
);
const id = param("id").isInt().withMessage("Turno inválido");
router.patch("/appointments/:id", id, body("status").isIn(["pending", "confirmed", "done", "cancelled"]).withMessage("Estado inválido"), validar, appController.cambiarEstado);
router.delete("/appointments/:id", id, validar, appController.borrarTurno);

// Recordatorios por WhatsApp
router.get("/reminders", appController.recordatorios);
router.post("/appointments/:id/reminded", id, body("sent").optional().isBoolean().withMessage("Valor inválido"), validar, appController.marcarRecordatorio);
router.put(
  "/settings",
  body("days").isArray().withMessage("Elegí los días de atención"),
  body("from").matches(HORA).withMessage("Horario inválido"),
  body("to").matches(HORA).custom((to, { req }) => aMin(to) > aMin(req.body.from)).withMessage("Horario inválido"),
  body("step").isIn([15, 20, 30, 45, 60].map(String)).withMessage("Duración inválida"),
  body("whatsapp").optional().isLength({ max: 30 }).withMessage("WhatsApp demasiado largo"),
  body("reminderText").optional().isLength({ max: 400 }).withMessage("El mensaje puede tener hasta 400 caracteres"),
  body("reminderAuto").optional().isBoolean().withMessage("Valor inválido"),
  body("rubro").optional().isIn(rubros.ids).withMessage("Rubro inválido"),
  validar,
  appController.guardarAjustes
);

// Servicios y categorías del negocio
const servicio = [
  body("name").trim().notEmpty().withMessage("Poné el nombre del servicio").isLength({ max: 80 }).withMessage("Nombre demasiado largo"),
  body("category").optional().isLength({ max: 60 }).withMessage("Categoría demasiado larga"),
  body("price").optional({ values: "falsy" }).isInt({ min: 0, max: 100000000 }).withMessage("Precio inválido"),
  body("minutes").isInt({ min: 5, max: 600 }).withMessage("Duración inválida (entre 5 y 600 minutos)"),
  body("desc").optional().isLength({ max: 300 }).withMessage("La descripción puede tener hasta 300 caracteres"),
  validar,
];
router.get("/services", appController.servicios);
router.post("/services/suggested", appController.agregarSugeridos);
router.post("/services", servicio, appController.crearServicio);
router.put("/services/:id", param("id").isInt().withMessage("Servicio inválido"), servicio, appController.editarServicio);
router.delete("/services/:id", param("id").isInt().withMessage("Servicio inválido"), validar, appController.borrarServicio);

module.exports = router;
