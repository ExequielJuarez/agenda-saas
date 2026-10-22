module.exports = (sequelize, DataTypes) => {
  const Turno = sequelize.define(
    "Turno",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      negocio_id: { type: DataTypes.INTEGER, allowNull: false },
      nombre: { type: DataTypes.STRING(80), allowNull: false },
      telefono: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "" },
      servicio: { type: DataTypes.STRING(80), allowNull: false },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      hora: { type: DataTypes.STRING(5), allowNull: false },
      duracion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 }, // minutos que ocupa
      precio: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // precio del servicio al momento de reservar
      estado: { type: DataTypes.ENUM("pending", "confirmed", "done", "cancelled"), allowNull: false, defaultValue: "pending" },
      recordatorio_en: { type: DataTypes.DATE, allowNull: true }, // cuándo se mandó (o se marcó como enviado) el recordatorio
      recordatorio_error: { type: DataTypes.STRING(200), allowNull: true }, // último error del envío automático
      origen: { type: DataTypes.ENUM("web", "manual"), allowNull: false, defaultValue: "web" },
    },
    { tableName: "turnos", indexes: [{ fields: ["negocio_id", "fecha", "hora"] }] }
  );
  Turno.associate = (db) => Turno.belongsTo(db.Negocio, { foreignKey: "negocio_id" });
  return Turno;
};
