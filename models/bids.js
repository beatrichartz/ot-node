const uuidv4 = require('uuid/v4');

module.exports = (sequelize, DataTypes) => {
    const bids = sequelize.define('bids', {
        id: {
            type: DataTypes.STRING,
            defaultValue: () => uuidv4(),
            primaryKey: true,
        },
        offer_id: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        data_set_id: DataTypes.STRING,
        dc_node_id: DataTypes.STRING,
        dc_identity: DataTypes.STRING,
        data_size_in_bytes: DataTypes.STRING,
        holding_time_in_minutes: DataTypes.INTEGER,
        litigation_interval_in_minutes: DataTypes.INTEGER,
        token_amount: DataTypes.STRING,
        status: DataTypes.STRING,
        message: DataTypes.STRING,
        created_at: DataTypes.DATE,
        updated_at: DataTypes.DATE,
    }, {});
    bids.associate = (models) => {
        // associations can be defined here
    };
    return bids;
};
