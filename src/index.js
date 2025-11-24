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

app.get("/", (req, res) => res.json({ status: "OK" }));

app.get("/api/health", async (req, res) => {
    res.json({
        status: "OK",
        uptime: process.uptime(),
        redis: cacheManager.isConnected(),
        timestamp: Date.now()
    });
});

// 404
app.use((req, res) => handleError(res, { status: 404, message: `Route ${req.url} not found` }));

// Error handler
app.use((err, req, res) => {
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

// Initialize DB + redis + models
bootstrap();

// Start the server if not on vercel
if (!process.env.VERCEL && process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "VERCEL") {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () =>
        console.log(`🚀 Server running on port ${PORT}`)
    );
}

// Serverless - Vercel
module.exports = app;
module.exports.handler = (req, res) => app(req, res);
