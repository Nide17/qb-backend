// Environment & Dependencies
require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const compression = require("compression");
const morgan = require("morgan");

const socketManager = require("./utils/enhanced-socket");
const { cacheManager } = require("./utils/global-helpers");
const { handleError } = require("./utils/error");
const mountRoutes = require("./utils/mount-routes");
const bootstrap = require("./utils/bootstrap");

// App & Server Setup
const app = express();
const server = http.createServer(app);

const isVercel =
    process.env.VERCEL ||
    process.env.NODE_ENV === "VERCEL" ||
    process.env.NODE_ENV === "test";

// Bootstrap State
let bootstrapDone = false;
let bootstrapError = null;

// Global Middlewares
app.use(express.json());
app.use(cors());
app.use(compression());
app.use(morgan("dev"));

// Health Check Routes
app.get("/", (req, res) => res.json({ status: "OK" }));

app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        uptime: process.uptime(),
        redis: cacheManager.isConnected(),
        timestamp: Date.now(),
        bootstrapDone,
        bootstrapError: bootstrapError?.message || null,
    });
});

// Block API routes until bootstrap is ready
const ensureBootstrap = (req, res, next) => {
    if (!bootstrapDone) {
        return res.status(503).json({
            status: "Service Unavailable",
            message: "Database initialization in progress",
            bootstrapError: bootstrapError?.message || null,
        });
    }
    next();
};

app.use("/api", ensureBootstrap);

// Socket.io Setup
if (!isVercel) {
    const io = socketManager.initialize(server);
    app.use((req, res, next) => {
        req.io = io;
        next();
    });
}

// Routes
mountRoutes(app);

// 404 Handler (after routes)
app.use((req, res) =>
    handleError(res, {
        status: 404,
        message: `Route ${req.url} not found`,
    })
);

// Error Handler
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error("❌ Error:", err);

    const safe = {
        name: err.name,
        message: err.message,
        status: err.status,
        code: err.code,
        stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
    };

    handleError(res, safe);
});

// Bootstrap Logic & Server Start
async function startServer() {
    try {
        await bootstrap();
        bootstrapDone = true;

        console.log("✅ Bootstrap complete");

        if (isVercel) return; // Vercel uses exported handler

        let port = Number(process.env.PORT || 5000);

        const tryStart = () =>
            server.listen(port, () =>
                console.log(`🚀 Server running on port ${port}`)
            );

        server.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
                console.warn(`⚠️ Port ${port} in use. Retrying on ${port + 1}...`);
                port++;
                return tryStart();
            }

            console.error("❌ Server error:", err);
            process.exit(1);
        });

        tryStart();
    } catch (error) {
        bootstrapError = error;
        console.error("❌ Bootstrap error:", error);
        process.exit(1);
    }
}

startServer();

// Vercel Serverless Export
module.exports = app;
module.exports.handler = (req, res) => app(req, res);
