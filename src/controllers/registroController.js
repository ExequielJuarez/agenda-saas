// Registro público: el negocio elige su rubro y arranca la prueba gratis.
const negocioService = require("../services/negocioService");

module.exports = {
  async registrar(req, res) {
    const { businessName, email, password, rubro } = req.body;
    try {
      const negocio = await negocioService.crear({ nombre: businessName, email, password, rubro });
      // Entra directo a su panel
      req.session.regenerate((err) => {
        if (err) throw err;
        req.session.negocioId = negocio.id;
        res.status(201).json({ ok: true });
      });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  },
};
