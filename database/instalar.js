// Crea la base de datos si no existe y todas las tablas.
// Uso: npm run db:instalar   (se puede repetir sin problema: no pisa datos existentes)
require("dotenv").config();
const mysql = require("mysql2/promise");
const config = require("../src/model/database/config/config")[process.env.NODE_ENV || "development"];

(async () => {
  const conexion = await mysql.createConnection({ host: config.host, port: config.port, user: config.username, password: config.password || "" });
  await conexion.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conexion.end();

  const db = require("../src/model/database/models");
  await db.sequelize.sync();
  console.log(`✅ Base "${config.database}" lista. Iniciá el servidor con: npm start`);
  console.log("   Entrá a /owner con tu OWNER_PASSWORD y creá tu primer cliente.");
  await db.sequelize.close();
})().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
