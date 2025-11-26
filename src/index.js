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

// Track bootstrap state for serverless graceful degradation
let bootstrapDone = false;
let bootstrapError = null;

// Middleware (basic)
app.use(express.json());
app.use(cors());
app.use(compression());
app.use(morgan("dev"));

app.get("/", (req, res) => res.json({ status: "OK" }));

app.get("/api/health", async (req, res) => {
    res.json({
        status: "OK",
        uptime: process.uptime(),
        redis: cacheManager.isConnected(),
        timestamp: Date.now(),
        bootstrapDone,
        bootstrapError: bootstrapError ? bootstrapError.message : null
    });
});

// Middleware to ensure DB is ready before allowing API calls
app.use("/api", (req, res, next) => {
    if (!bootstrapDone) {
        return res.status(503).json({
            status: "Service Unavailable",
            message: "Database initialization in progress",
            bootstrapError: bootstrapError ? bootstrapError.message : null
        });
    }
    next();
});

// Initialize socket.io (can work without full DB in some cases)
const io = socketManager.initialize(server);
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

// Start bootstrap asynchronously (don't block app initialization)
bootstrap().then(() => {
    bootstrapDone = true;
    console.log("✅ Bootstrap complete");

    // Start the server if not on vercel (i.e., local node)
    if (!process.env.VERCEL && process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "VERCEL") {
        const PORT = process.env.PORT || 5000;
        server.listen(PORT, () =>
            console.log(`🚀 Server running on port ${PORT}`)
        );
    }
}).catch(err => {

    // If port is already in use, don't exit; increment and try again
    if (err.code === "EADDRINUSE") {
        const PORT = process.env.PORT || 5000;
        server.listen(PORT + 1, () =>
            console.log(`🚀 Server running on port ${PORT + 1}`)
        );
        bootstrapDone = true;
        return;
    }

    bootstrapError = err;
    console.error("❌ Bootstrap error:", err);
    process.exit(1);
});

// Serverless - Vercel
module.exports = app;
module.exports.handler = (req, res) => app(req, res);
