'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Contacts', 'messageTemplate', {
      type: Sequelize.STRING,
      defaultValue: 'default'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Contacts', 'messageTemplate');
  }
};
