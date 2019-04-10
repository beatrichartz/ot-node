module.exports = (sequelize, DataTypes) => {
    const miner = sequelize.define('miner_tasks', {
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
        // associations can be defined here
    };
    return miner;
};
