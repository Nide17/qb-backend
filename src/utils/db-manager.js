const mongoose = require('mongoose');
mongoose.set("strictQuery", false);

// Global cache (works for local + production + vercel)
if (!global.__db_conn__) {
    global.__db_conn__ = {};
}

const cache = global.__db_conn__;

/**
 * Create or reuse a DB connection by name.
 * Always returns a ready connection or a pending promise.
 */
function getDB(name, uri) {

    if (!uri) {
        throw new Error(`Missing MongoDB URI for database: ${name}`);
    }

    // Already connected?
    if (cache[name]?.conn) {
        return cache[name].conn;
    }

    // Already connecting?
    if (cache[name]?.promise) {
        return cache[name].promise;
    }

    console.log(`[DB:${name}] Connecting...`);

    const promise = mongoose
        .createConnection(uri, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 30000,
            retryWrites: true,
        })
        .asPromise()
        .then((connection) => {
            cache[name].conn = connection;

            console.log(`[DB:${name}] Connected`);
            return connection;
        })
        .catch((err) => {
            console.error(`[DB:${name}] Error:`, err.message);
            delete cache[name];
            throw err;
        });

    cache[name] = { promise };

    return promise;
}

module.exports = { getDB };
