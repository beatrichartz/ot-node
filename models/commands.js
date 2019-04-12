const uuidv4 = require('uuid/v4');

module.exports = (sequelize, DataTypes) => {
    const commands = sequelize.define('commands', {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: () => uuidv4(),
        },
        name: DataTypes.STRING,
        data: DataTypes.JSON,
        sequence: DataTypes.JSON,
        ready_at: DataTypes.BIGINT,
        delay: DataTypes.BIGINT,
        started_at: DataTypes.BIGINT,
        deadline_at: DataTypes.BIGINT,
        period: DataTypes.BIGINT,
        status: DataTypes.STRING,
        message: DataTypes.TEXT,
        parent_id: DataTypes.UUID,
        transactional: DataTypes.BOOLEAN,
        retries: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        created_at: DataTypes.DATE,
        updated_at: DataTypes.DATE,
    }, {});
    commands.associate = (models) => {
        commands.belongsTo(models.commands, {
            foreignKey: 'parent_id',
        });
    };
    return commands;
};
