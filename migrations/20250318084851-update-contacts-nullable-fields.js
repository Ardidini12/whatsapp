'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.changeColumn('Contacts', 'name', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await queryInterface.changeColumn('Contacts', 'surname', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await queryInterface.changeColumn('Contacts', 'email', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await queryInterface.changeColumn('Contacts', 'birthday', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
  }
};
