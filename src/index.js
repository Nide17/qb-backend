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
const io = socketManager.initialize(server);

// Middleware
app.use(express.json());
app.use(cors());
app.use(compression());
app.use(morgan("dev"));
app.use((req, res, next) => { req.io = io; next(); });

// Routes
mountRoutes(app);

// Root Route
app.get("/", (req, res) => res.json({ status: "OK" }));

// Health Check
app.get("/api/health", async (req, res) => {
    res.json({
        status: "OK",
        uptime: process.uptime(),
        redis: cacheManager.isConnected(),
        timestamp: Date.now()
    });
});

// Global 404
app.use((req, res) => handleError(res, { status: 404, message: `Route ${req.url} not found` }));

// Error Handler
app.use((err, req, res) => {
    console.error("❌ Error:", err);
    handleError(res, {
        status: err.status || 500,
        message: err.message || "Internal Server Error",
        stack: process.env.NODE_ENV === "production" ? undefined : err.stack
    });
});

// Start server
bootstrap(server);
