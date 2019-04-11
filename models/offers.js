const uuidv4 = require('uuid/v4');

module.exports = (sequelize, DataTypes) => {
    const offers = sequelize.define('offers', {
        id: {
            type: DataTypes.STRING,
            defaultValue: () => uuidv4(),
            primaryKey: true,
        },
        offer_id: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true,
        },
        data_set_id: DataTypes.STRING,
        holding_time_in_minutes: DataTypes.INTEGER,
        token_amount_per_holder: DataTypes.STRING,
        litigation_interval_in_minutes: DataTypes.INTEGER,
        red_litigation_hash: DataTypes.STRING,
        blue_litigation_hash: DataTypes.STRING,
        green_litigation_hash: DataTypes.STRING,
        task: DataTypes.STRING,
        status: DataTypes.STRING,
        global_status: DataTypes.STRING,
        message: DataTypes.STRING,
        transaction_hash: DataTypes.STRING(128),
        created_at: DataTypes.DATE,
        updated_at: DataTypes.DATE,
    }, {});
    offers.associate = (models) => {
        offers.belongsTo(models.datasets, {
            foreignKey: 'data_set_id',
            targetKey: 'data_set_id',
        });
        offers.hasMany(models.holders, {
            foreignKey: 'offer_id',
            sourceKey: 'offer_id',
        });
    };
    return offers;
};
