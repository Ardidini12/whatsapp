const { Model, DataTypes } = require('sequelize');
const { Sequelize } = require('sequelize');

module.exports = (sequelize) => {
  class Template extends Model {}

  Template.init({
    templateName: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    sequelize,
    modelName: 'Template',
    tableName: 'Templates'
  });

  Template.afterUpdate(async (template) => {
    if (template.isDefault) {
      // Ensure only one default template exists
      await Template.update(
        { isDefault: false },
        { 
          where: { 
            id: { [Sequelize.Op.ne]: template.id },
            isDefault: true 
          } 
        }
      );
    }
  });

  Template.beforeDestroy(async (template) => {
    if (template.isDefault) {
      throw new Error('Default template cannot be deleted');
    }
  });

  return Template;
}; 