// Servicios que ofrece cada negocio, agrupados por categoría (ej: "Cortes", "Barba").
module.exports = (sequelize, DataTypes) => {
  const Servicio = sequelize.define(
    "Servicio",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      negocio_id: { type: DataTypes.INTEGER, allowNull: false },
      categoria: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "General" },
      nombre: { type: DataTypes.STRING(80), allowNull: false },
      precio: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      minutos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
      descripcion: { type: DataTypes.STRING(300), allowNull: false, defaultValue: "" },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: "servicios", indexes: [{ fields: ["negocio_id"] }] }
  );
  Servicio.associate = (db) => Servicio.belongsTo(db.Negocio, { foreignKey: "negocio_id" });
  return Servicio;
};
