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
      estado: { type: DataTypes.ENUM("pending", "confirmed", "done", "cancelled"), allowNull: false, defaultValue: "pending" },
      origen: { type: DataTypes.ENUM("web", "manual"), allowNull: false, defaultValue: "web" },
    },
    { tableName: "turnos", indexes: [{ fields: ["negocio_id", "fecha", "hora"] }] }
  );
  Turno.associate = (db) => Turno.belongsTo(db.Negocio, { foreignKey: "negocio_id" });
  return Turno;
};
