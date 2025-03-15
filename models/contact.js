'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Contact extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Contact.init({
    name: DataTypes.STRING,
    surname: DataTypes.STRING,
    phone_number: DataTypes.STRING,
    email: DataTypes.STRING,
    birthday: DataTypes.DATE,
    source: DataTypes.STRING,
    messageTemplate: {
      type: DataTypes.STRING,
      defaultValue: 'default'
    }
  }, {
    sequelize,
    modelName: 'Contact',
  });
  return Contact;
};