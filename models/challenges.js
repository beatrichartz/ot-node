const uuidv4 = require('uuid/v4');

module.exports = (sequelize, DataTypes) => {
    const challenges = sequelize.define('challenges', {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: () => uuidv4(),
        },
        holder_id: DataTypes.STRING,
        block_id: DataTypes.INTEGER,
        offer_id: DataTypes.STRING,
        answer: DataTypes.STRING,
        expected_answer: DataTypes.STRING,
        data_set_id: DataTypes.STRING,
        start_time: DataTypes.BIGINT,
        end_time: DataTypes.BIGINT,
        status: DataTypes.STRING,
        created_at: DataTypes.DATE,
        updated_at: DataTypes.DATE,
    }, {});
    challenges.associate = (models) => {
        challenges.belongsTo(models.offers, {
            foreignKey: 'offer_id',
            targetKey: 'offer_id',
        });
        challenges.belongsTo(models.holders, {
            foreignKey: 'holder_id',
        });
    };
    return challenges;
};
