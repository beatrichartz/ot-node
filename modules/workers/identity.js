const kadence = require('@kadenceproject/kadence');
const readLine = require('readline');
const { EventEmitter } = require('events');


if (parseInt(process.env.kadence_TestNetworkEnabled, 10)) {
    kadence.constants.SOLUTION_DIFFICULTY = 2;
    kadence.constants.IDENTITY_DIFFICULTY = 2;
}

process.once('message', ([xprv, index]) => {
    console.log('Difficulty' + kadence.constants.IDENTITY_DIFFICULTY);
    const identity = new kadence.eclipse.EclipseIdentity(xprv, index);

    let attempts = 0;
    const start = Date.now();

    identity.on('index', () => {
        attempts += 1;
        process.send({ attempts });
    });

    identity.solve()
        .then((result) => {
            process.send({ index: result, time: Date.now() - start });
            process.exit(0);
        })
        .catch((err) => {
            process.send({ error: err.message });
            process.exit(1);
        });
});

process.once('SIGTERM', () => process.exit(0));

if (process.platform === 'win32') {
    readLine.createInterface({
        input: process.stdin,
        output: process.stdout,
    }).on('SIGTERM', () => process.emit('SIGTERM'));
}
