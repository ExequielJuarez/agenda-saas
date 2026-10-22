// API del panel del dueño: /api/owner/*
const express = require("express");
const { body, param } = require("express-validator");
const ownerController = require("../controllers/ownerController");
const validar = require("../middlewares/validar");
const { limitarIntentos, soloDueno } = require("../middlewares/auth");

const router = express.Router();

router.post("/login", limitarIntentos, body("password").notEmpty().withMessage("Ingresá la contraseña"), validar, ownerController.login);
router.post("/logout", ownerController.logout);

router.use(soloDueno);
router.get("/overview", ownerController.resumen);
router.post(
  "/tenants",
  body("businessName").trim().notEmpty().withMessage("Completá el nombre del negocio").isLength({ max: 80 }).withMessage("Nombre demasiado largo"),
  body("email").trim().isEmail().withMessage("Ingresá un email válido"),
  body("password").isLength({ min: 6 }).withMessage("La contraseña debe tener al menos 6 caracteres"),
  body("price").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("Precio inválido"),
  validar,
  ownerController.crearCliente
);
const id = param("id").isInt().withMessage("Cliente inválido");
router.post("/tenants/:id/payments", id, body("amount").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("Monto inválido"), validar, ownerController.registrarPago);
router.patch(
  "/tenants/:id", id,
  body("price").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("Precio inválido"),
  body("password").optional({ values: "falsy" }).isLength({ min: 6 }).withMessage("La contraseña debe tener al menos 6 caracteres"),
  validar,
  ownerController.editar
);
router.delete("/tenants/:id", id, validar, ownerController.eliminar);

module.exports = router;
