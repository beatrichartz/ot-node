const uuidv4 = require('uuid/v4');

module.exports = (sequelize, DataTypes) => {
    const miner = sequelize.define('miner_tasks', {
        id: {
            type: DataTypes.STRING,
            defaultValue: () => uuidv4(),
            primaryKey: true,
        },
        offer_id: DataTypes.STRING,
        difficulty: DataTypes.INTEGER,
        task: DataTypes.STRING,
        result: DataTypes.JSON,
        status: DataTypes.STRING,
        message: DataTypes.STRING,
        created_at: DataTypes.DATE,
        updated_at: DataTypes.DATE,
    }, {});
    miner.associate = (models) => {
        miner.belongsTo(models.offers, {
            foreignKey: 'offer_id',
            targetKey: 'offer_id',
        });
    };
    return miner;
};
