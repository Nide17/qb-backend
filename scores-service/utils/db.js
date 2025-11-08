const mongoose = require('mongoose');

function makeNewConnection(uri) {
    const db = mongoose.createConnection(uri);

    db.on('error', function (error) {
        console.log(`MongoDB :: connection ${this.name} ${JSON.stringify(error)}`);
        db.close().catch(() => console.log(`MongoDB :: failed to close connection ${this.name}`));
    });

    db.on('connected', function () {
        console.log(`MongoDB :: connected ${this.name}`);
    });

    db.on('disconnected', function () {
        console.log(`MongoDB :: disconnected ${this.name}`);
    });

    return db;
}

const dbScores = makeNewConnection(process.env.MONGODB_URI);

dbScores.once('open', () => {
    console.log('MongoDB is connected at', dbScores.name);
});

module.exports = dbScores;
