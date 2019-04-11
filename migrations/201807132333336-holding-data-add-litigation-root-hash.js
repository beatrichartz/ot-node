
module.exports = {
    up: async (queryInterface, Sequelize) =>
        queryInterface.addColumn(
            'holdings',
            'litigation_root_hash',
            {
                type: Sequelize.STRING,
            },
        ),
    down: queryInterface => queryInterface.removeColumn('holdings', 'litigation_root_hash'),
};
