const uuidv4 = require('uuid/v4');

module.exports = (sequelize, DataTypes) => {
    const holders = sequelize.define(
        'holders', {
            id: {
                type: DataTypes.STRING,
                defaultValue: () => uuidv4(),
                primaryKey: true,
            },
            dh_id: DataTypes.STRING,
            dh_wallet: DataTypes.STRING,
            dh_identity: DataTypes.STRING,
            offer_id: DataTypes.STRING,
            color: DataTypes.STRING,
            litigation_private_key: DataTypes.TEXT,
            litigation_public_key: DataTypes.TEXT,
            distribution_public_key: DataTypes.TEXT,
            distribution_private_key: DataTypes.TEXT,
            litigation_root_hash: DataTypes.STRING,
            distribution_root_hash: DataTypes.STRING,
            distribution_epk: DataTypes.TEXT,
            confirmation: DataTypes.TEXT,
            status: DataTypes.STRING,
            created_at: DataTypes.DATE,
            updated_at: DataTypes.DATE,
        },
        {
            indexes: [
                {
                    unique: true,
                    fields: ['offer_id', 'dh_identity', 'dh_id'],
                },
            ],
        },
    );
    holders.associate = (models) => {
        holders.belongsTo(models.offers, {
            foreignKey: 'offer_id',
            targetKey: 'offer_id',
        });
    };
    return holders;
};
