const { validationResult } = require("express-validator");

// Corta la petición con un 400 y el primer error de validación.
module.exports = (req, res, next) => {
  const errores = validationResult(req);
  if (errores.isEmpty()) return next();
  res.status(400).json({ error: errores.array()[0].msg });
};
