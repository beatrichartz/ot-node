const uuidv4 = require('uuid/v4');

module.exports = (sequelize, DataTypes) => {
    const holding_data = sequelize.define('holding_data', {
        id: {
            type: DataTypes.STRING,
            defaultValue: () => uuidv4(),
            primaryKey: true,
        },
        offer_id: DataTypes.STRING,
        data_set_id: DataTypes.STRING,
        source_wallet: DataTypes.STRING,
        litigation_public_key: DataTypes.STRING,
        litigation_root_hash: DataTypes.STRING,
        distribution_public_key: DataTypes.STRING,
        distribution_private_key: DataTypes.STRING,
        distribution_epk: DataTypes.STRING,
        transaction_hash: DataTypes.STRING(128),
        color: DataTypes.INTEGER,
        created_at: DataTypes.DATE,
        updated_at: DataTypes.DATE,
        origin: {
            type: DataTypes.STRING,
            allowNull: false,
        },
    }, {
        tableName: 'holding_data',
    });
    holding_data.associate = (models) => {
        holding_data.belongsTo(models.data_info, {
            foreignKey: 'data_set_id',
            targetKey: 'data_set_id',
        });
        holding_data.belongsTo(models.bids, {
            foreignKey: 'offer_id',
            targetKey: 'offer_id',
        });
    };
    return holding_data;
};
