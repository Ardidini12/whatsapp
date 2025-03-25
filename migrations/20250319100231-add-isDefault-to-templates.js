'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Templates', 'isDefault', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });
    
    // Create default birthday template if it doesn't exist
    await queryInterface.sequelize.query(`
      INSERT INTO Templates (templateName, description, isDefault, createdAt, updatedAt)
      SELECT 'Birthday', 'Happy Birthday {name}! 🎉 Wishing you a wonderful day!', true, NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT id FROM Templates WHERE templateName = 'Birthday'
      )
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Templates', 'isDefault');
  }
};
