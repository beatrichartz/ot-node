const uuidv4 = require('uuid/v4');

module.exports = (sequelize, DataTypes) => {
    const dataset = sequelize.define('dataset', {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: () => uuidv4(),
        },
        data_set_id: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        data_provider_wallet: DataTypes.STRING(42),
        total_documents: DataTypes.INTEGER,
        root_hash: DataTypes.STRING(40),
        import_timestamp: DataTypes.DATE,
        data_size: DataTypes.INTEGER,
        origin: DataTypes.STRING,
        created_at: DataTypes.DATE,
        updated_at: DataTypes.DATE,
    }, {
        tableName: 'dataset',
    });
    dataset.associate = (models) => {
        // associations can be defined here
    };
    return dataset;
};
