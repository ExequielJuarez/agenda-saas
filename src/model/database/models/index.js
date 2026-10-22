// Carga todos los modelos de esta carpeta (convención de sequelize-cli).
const fs = require("fs");
const path = require("path");
const Sequelize = require("sequelize");

const env = process.env.NODE_ENV || "development";
const config = require("../config/config")[env];

const sequelize = new Sequelize(config.database, config.username, config.password, config);
const db = {};

fs.readdirSync(__dirname)
  .filter((f) => f !== "index.js" && f.endsWith(".js"))
  .forEach((f) => {
    const model = require(path.join(__dirname, f))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

Object.values(db).forEach((m) => m.associate && m.associate(db));

db.sequelize = sequelize;
db.Sequelize = Sequelize;
module.exports = db;
