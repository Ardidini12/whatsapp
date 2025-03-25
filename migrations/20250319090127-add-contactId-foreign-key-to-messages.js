'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addConstraint('Messages', {
      fields: ['contactId'],
      type: 'foreign key',
      name: 'fk_contactId', // optional: provide a custom name for the constraint
      references: {
        table: 'Contacts',
        field: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeConstraint('Messages', 'fk_contactId');
  }
};
