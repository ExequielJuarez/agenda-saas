// Cada cliente que te paga la suscripción es un "Negocio".
module.exports = (sequelize, DataTypes) => {
  const Negocio = sequelize.define(
    "Negocio",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      slug: { type: DataTypes.STRING(60), allowNull: false, unique: true },
      nombre: { type: DataTypes.STRING(80), allowNull: false },
      email: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING(100), allowNull: false },
      precio: { type: DataTypes.INTEGER, allowNull: false },
      link_pago: { type: DataTypes.STRING(300), allowNull: false, defaultValue: "" },
      whatsapp: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "" }, // WhatsApp del negocio, para recibir reservas
      suspendido: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      recordatorios_auto: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // envío automático por WhatsApp
      mensaje_recordatorio: { type: DataTypes.STRING(400), allowNull: false, defaultValue: "" }, // vacío = mensaje por defecto
      vence: { type: DataTypes.DATEONLY, allowNull: false }, // hasta cuándo está pago
      // Días, horario, duración de turnos y servicios (JSON en texto, compatible con MySQL y MariaDB)
      ajustes: {
        type: DataTypes.TEXT,
        allowNull: false,
        get() {
          return JSON.parse(this.getDataValue("ajustes"));
        },
        set(v) {
          this.setDataValue("ajustes", JSON.stringify(v));
        },
      },
    },
    { tableName: "negocios" }
  );

  Negocio.associate = (db) => {
    Negocio.hasMany(db.Pago, { foreignKey: "negocio_id", onDelete: "CASCADE" });
    Negocio.hasMany(db.Turno, { foreignKey: "negocio_id", onDelete: "CASCADE" });
    Negocio.hasMany(db.Servicio, { foreignKey: "negocio_id", onDelete: "CASCADE" });
  };
  return Negocio;
};
