'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.changeColumn('Contacts', 'source', {
      type: Sequelize.STRING,
      allowNull: false
    });

    await queryInterface.changeColumn('Contacts', 'phone_number', {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true
    });
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.changeColumn('Contacts', 'source', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.changeColumn('Contacts', 'phone_number', {
      type: Sequelize.STRING,
      allowNull: false,
      unique: false
    });
  }
};
