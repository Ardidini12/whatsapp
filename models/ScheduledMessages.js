module.exports = (sequelize, DataTypes) => {
    const ScheduledMessage = sequelize.define('ScheduledMessage', {
        contactName: DataTypes.STRING,
        scheduledTime: DataTypes.DATE,
        status: DataTypes.STRING,
        whatsappId: DataTypes.STRING,
        message: DataTypes.TEXT
    });

    return ScheduledMessage;
};
