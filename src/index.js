require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const compression = require("compression");
const morgan = require("morgan");

const socketManager = require("./utils/enhanced-socket");
const { cacheManager } = require("./utils/global-helpers");
const { handleError } = require("./utils/error");
const mountRoutes = require('./utils/mount-routes');
const bootstrap = require('./utils/bootstrap');

const app = express();
const server = http.createServer(app);
// Middleware (basic)
app.use(express.json());
app.use(cors());
app.use(compression());
app.use(morgan("dev"));

// We'll initialize DBs and then initialize sockets so socket handlers see ready models

app.get("/", (req, res) => res.json({ status: "OK" }));

app.get("/api/health", async (req, res) => {
    res.json({
        status: "OK",
        uptime: process.uptime(),
        redis: cacheManager.isConnected(),
        timestamp: Date.now()
    });
});

// Initialize DB + redis + models, then start socket manager and mount routes
bootstrap().then(() => {
    // initialize sockets after DBs/models are ready
    const io = socketManager.initialize(server);

    // attach io to requests so route handlers can emit events
    app.use((req, res, next) => { req.io = io; next(); });

    // Routes (mounted after req.io middleware)
    mountRoutes(app);

    // 404 - must be after routes
    app.use((req, res) => handleError(res, { status: 404, message: `Route ${req.url} not found` }));

    // Error handler: keep 'next' to handle auth middleware errors, ...
    app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
        console.error("❌ Error:", err);
        const safe = {
            message: err.message,
            name: err.name,
            status: err.status,
            code: err.code,
            stack: process.env.NODE_ENV === "production" ? undefined : err.stack
        };
        handleError(res, safe);
    });

    // Start the server if not on vercel
    if (!process.env.VERCEL && process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "VERCEL") {
        const PORT = process.env.PORT || 5000;
        server.listen(PORT, () =>
            console.log(`🚀 Server running on port ${PORT}`)
        );
    }
}).catch(err => {
    console.error('❌ Bootstrap failed, aborting startup:', err);
    process.exit(1);
});

// Serverless - Vercel
module.exports = app;
module.exports.handler = (req, res) => app(req, res);
