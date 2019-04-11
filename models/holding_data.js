const uuidv4 = require('uuid/v4');

module.exports = (sequelize, DataTypes) => {
    const holdings = sequelize.define('holdings', {
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
        tableName: 'holdings',
    });
    holdings.associate = (models) => {
        holdings.belongsTo(models.datasets, {
            foreignKey: 'data_set_id',
            targetKey: 'data_set_id',
        });
        holdings.belongsTo(models.bids, {
            foreignKey: 'offer_id',
            targetKey: 'offer_id',
        });
    };
    return holdings;
};
