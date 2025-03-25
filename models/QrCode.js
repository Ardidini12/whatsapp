'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class QrCode extends Model {
    static associate(models) {
      // define association here if needed
    }
  }
  QrCode.init({
    qrCodeDataUrl: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'active'
    }
  }, {
    sequelize,
    modelName: 'QrCode',
    tableName: 'qr_codes',
    timestamps: true
  });
  return QrCode;
};
