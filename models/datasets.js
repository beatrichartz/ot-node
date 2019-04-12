const uuidv4 = require('uuid/v4');

module.exports = (sequelize, DataTypes) => {
    const datasets = sequelize.define('datasets', {
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
        data_provider_wallet: DataTypes.STRING,
        total_documents: DataTypes.INTEGER,
        root_hash: DataTypes.STRING,
        import_timestamp: DataTypes.DATE,
        data_size: DataTypes.INTEGER,
        origin: DataTypes.STRING,
        created_at: DataTypes.DATE,
        updated_at: DataTypes.DATE,
    });
    datasets.associate = (models) => {
        // associations can be defined here
    };
    return datasets;
};
