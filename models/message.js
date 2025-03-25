"use strict";
module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define('Message', {
    contactId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    name: DataTypes.STRING,
    surname: DataTypes.STRING,
    phone_number: DataTypes.STRING,
    message: DataTypes.TEXT,
    status: DataTypes.STRING,
    scheduledTime: DataTypes.DATE,
    sentAt: DataTypes.DATE,
    canceledAt: DataTypes.DATE
  }, {
    timestamps: true,
    updatedAt: 'updatedAt',
    createdAt: 'createdAt'
  });

  Message.associate = function(models) {
    // A Message belongs to a Contact
    Message.belongsTo(models.Contact, {
      foreignKey: 'contactId',
      as: 'contact'
    });
  };

  return Message;
}; 