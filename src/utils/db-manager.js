// utils/db-manager.js
const mongoose = require("mongoose");
mongoose.set("strictQuery", false);

if (!global.__db_conn__) global.__db_conn__ = {};
const cache = global.__db_conn__;

const registry = require("./model-registry");

function attachModels(dbName, conn) {
    if (conn.__modelsAttached) return conn.models;

    const models = registry[dbName];
    if (!models) throw new Error(`No model registry entry for DB: ${dbName}`);

    for (const [modelName, schema] of Object.entries(models)) {
        if (!conn.models[modelName]) {
            conn.model(modelName, schema);
        }
    }

    conn.__modelsAttached = true;
    return conn.models;
}

async function getDB(dbName, uri) {
    if (!uri) throw new Error(`Missing MongoDB URI for: ${dbName}`);

    if (cache[dbName]?.conn) return cache[dbName].conn;
    if (cache[dbName]?.promise) return cache[dbName].promise;

    console.log(`[DB:${dbName}] Connecting...`);

    const promise = mongoose
        .createConnection(uri, {
            maxPoolSize: 15,
            retryWrites: true,
            serverSelectionTimeoutMS: 20000,
        })
        .asPromise()
        .then((conn) => {
            console.log(`[DB:${dbName}] Connected`);
            cache[dbName].conn = conn;
            attachModels(dbName, conn);
            return conn;
        })
        .catch((err) => {
            delete cache[dbName];
            throw err;
        });

    cache[dbName] = { promise };
    return promise;
}

async function getModels(dbName) {
    const uri = process.env[`${dbName.toUpperCase()}_URI`];
    const conn = await getDB(dbName, uri);
    return conn.models;
}

module.exports = { getDB, getModels };
