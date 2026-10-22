require("dotenv").config();
const express = require("express");
const path = require("path");
const methodOverride = require("method-override");
const session = require("express-session");

const app = express();

const indexRouter = require("./routes/index.Routes");
const ownerRouter = require("./routes/owner.Routes");
const appRouter = require("./routes/app.Routes");
const db = require("./model/database/models");

const puerto = Number(process.env.PORT) || 3000;
const enProduccion = process.env.NODE_ENV === "production";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
if (enProduccion) app.set("trust proxy", 1);

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "100kb" }));
app.use(methodOverride("_method"));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "cambiar-este-secreto",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", secure: enProduccion, maxAge: 12 * 60 * 60 * 1000 },
  })
);

app.use("/api/owner", ownerRouter);
app.use("/api/app", appRouter);
app.use("/", indexRouter);

// Error inesperado (por ejemplo, se cayó la base de datos)
app.use((err, req, res, next) => {
  // Errores del cliente (por ejemplo, JSON mal formado) no son fallas del servidor
  if (err.status && err.status < 500) return res.status(err.status).json({ error: "Solicitud inválida" });
  console.error("❌", err);
  if (req.path.startsWith("/api/")) return res.status(500).json({ error: "Error del servidor, probá de nuevo" });
  res.status(500).send("<h1>Algo salió mal</h1><p>Probá de nuevo en unos minutos.</p>");
});

// Arranca solo si hay conexión con la base de datos
db.sequelize
  .authenticate()
  // Crea las tablas que falten (no borra ni modifica las existentes)
  .then(() => db.sequelize.sync())
  .then(() => {
    console.log(`✅ Conectado a la base de datos "${db.sequelize.config.database}"`);
    app.listen(puerto, () => console.log(`🚀 Servidor Express corriendo en http://localhost:${puerto}  (dueño: /owner · clientes: /app)`));
    if (!process.env.OWNER_PASSWORD) console.log("⚠️  Definí OWNER_PASSWORD en el .env (ahora usa la contraseña por defecto).");
    console.log(
      require("./services/recordatorioService").programar()
        ? "📨 Recordatorios automáticos por WhatsApp activados (los clientes que lo prendan en Ajustes)"
        : "📨 Recordatorios automáticos desactivados (sin WA_TOKEN / WA_PHONE_ID). Los recordatorios manuales funcionan igual."
    );
  })
  .catch((error) => {
    console.error("❌ No se pudo conectar con la base de datos:", error.message);
    console.error("   Revisá DB_HOST, DB_USER, DB_PASSWORD y DB_NAME en el .env y que MySQL esté encendido.");
    console.error("   Para crear la base y las tablas: npm run db:instalar");
    process.exit(1);
  });
