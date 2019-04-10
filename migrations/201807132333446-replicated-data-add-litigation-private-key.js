
module.exports = {
    up: async (queryInterface, Sequelize) =>
        queryInterface.addColumn(
            'holders',
            'litigation_private_key',
            {
                type: Sequelize.STRING,
            },
        ),
    down: queryInterface => queryInterface.removeColumn('holders', 'litigation_private_key'),
};
