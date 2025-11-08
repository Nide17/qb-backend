const mongoose = require('mongoose');

const connections = {};

function getConnection(name, uri) {
    if (!connections[name]) {
        connections[name] = mongoose.createConnection(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
    }
    return connections[name];
}

module.exports = { getConnection };
