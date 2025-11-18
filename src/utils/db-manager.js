const mongoose = require('mongoose');

const connections = {};
const maxRetries = 5;
const retryDelay = 5000; // 5s
const reconnectDelay = 5000;

// Prevent simultaneous retries for the same DB
const retryLocks = {};

function log(name, msg, ...rest) {
    console.log(`[DB:${name}] ${msg}`, ...rest);
}

function getConnection(name, uri) {
    if (!connections[name]) {

        retryLocks[name] = false;
        let retryCount = 0;

        const connect = () => {
            if (retryLocks[name]) return; // Prevent double retries
            retryLocks[name] = true;

            connections[name] = mongoose.createConnection(uri, {
                connectTimeoutMS: 60000,
                socketTimeoutMS: 60000,
                serverSelectionTimeoutMS: 60000,
                maxPoolSize: 20,
                minPoolSize: 2,
                bufferCommands: true,
                retryWrites: true,
                w: "majority",
            });

            const conn = connections[name];

            // -------------------------
            // Event Listeners
            // -------------------------
            conn.on("connected", () => {
                log(name, "Connected");
                retryCount = 0;
                retryLocks[name] = false;
            });

            conn.on("error", (err) => {
                log(name, "Error:", err.message);

                if (retryCount < maxRetries) {
                    retryCount++;
                    log(name, `Retrying ${retryCount}/${maxRetries} in ${retryDelay / 1000}s...`);

                    setTimeout(() => {
                        safeClose(conn).then(() => {
                            retryLocks[name] = false;
                            connect();
                        });
                    }, retryDelay);

                } else {
                    log(name, `Max retries reached. No further attempts will be made.`);
                    retryLocks[name] = false;
                }
            });

            conn.on("disconnected", () => {
                log(name, "Disconnected");

                if (!retryLocks[name] && retryCount < maxRetries) {
                    retryLocks[name] = true;
                    log(name, `Reconnecting in ${reconnectDelay / 1000}s...`);

                    setTimeout(() => {
                        retryLocks[name] = false;
                        connect();
                    }, reconnectDelay);
                }
            });

            conn.on("reconnected", () => {
                log(name, "Reconnected");
            });
        };

        connect();
    }

    return connections[name];
}

// Safely close a connection before a retry
async function safeClose(conn) {
    try {
        if (conn && conn.readyState !== 0) {
            await conn.close();
        }
    } catch (err) {
        // ignore
    }
}

module.exports = { getConnection, };
