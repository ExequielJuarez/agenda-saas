module.exports = (sequelize, DataTypes) => {
  const Pago = sequelize.define(
    "Pago",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      negocio_id: { type: DataTypes.INTEGER, allowNull: false },
      monto: { type: DataTypes.INTEGER, allowNull: false },
      medio: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "Transferencia" },
      nota: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "" },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
    },
    { tableName: "pagos" }
  );
  Pago.associate = (db) => Pago.belongsTo(db.Negocio, { foreignKey: "negocio_id" });
  return Pago;
};
