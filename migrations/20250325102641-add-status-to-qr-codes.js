'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('qr_codes', 'status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'active'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('qr_codes', 'status');
  }
};
