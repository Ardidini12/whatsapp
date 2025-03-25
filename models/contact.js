'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize) => {
  const { DataTypes } = sequelize.Sequelize;

  class Contact extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // A Contact can have many Messages
      Contact.hasMany(models.Message, {
        foreignKey: 'contactId',
        as: 'messages'
      });
    }
  }
  Contact.init({
    name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    surname: {
      type: DataTypes.STRING,
      allowNull: true
    },
    phone_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    birthday: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    source: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Contact',
  });
  return Contact;
};