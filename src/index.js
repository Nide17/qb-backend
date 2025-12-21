// Environment & Dependencies
require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const compression = require("compression");
const morgan = require("morgan");

const initSocket = require("./utils/socket");
const { cacheManager } = require("./utils/global-helpers");
const { handleError } = require("./utils/error");
const mountRoutes = require("./utils/mount-routes");
const dbbootstrap = require("./utils/dbbootstrap");

// Platform Detection
const isVercel = !!(
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.NOW_REGION
);
const isHeroku = !!(process.env.DYNO);
const isServerless = isVercel;

// Bootstrap State Management
const dbBootstrapState = {
    done: false,
    error: null,
    promise: null,
};

// Initialize Bootstrap (singleton pattern for serverless)
function initializeDBBootstrap() {
    if (!dbBootstrapState.promise) {
        dbBootstrapState.promise = dbbootstrap()
            .then(() => {
                dbBootstrapState.done = true;
                console.log("✅ Bootstrap complete");
            })
            .catch((error) => {
                dbBootstrapState.error = error;
                console.error("❌ Bootstrap error:", error);
                throw error;
            });
    }
    return dbBootstrapState.promise;
}

// Create Express App
function createApp() {
    const app = express();

    // Middleware - Order matters!
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // CORS Configuration
    const corsOptions = {
        origin: process.env.CORS_ORIGIN || "*",
        credentials: true,
        optionsSuccessStatus: 200,
    };
    app.use(cors(corsOptions));

    app.use(compression());

    // Logging - lighter in production
    app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

    // Trust proxy for Heroku/Vercel
    if (isHeroku || isVercel) {
        app.set("trust proxy", 1);
    }

    // Health Check Routes (before bootstrap check)
    app.get("/", (req, res) =>
        res.json({
            status: "OK",
            platform: isVercel ? "vercel" : isHeroku ? "heroku" : "local",
        })
    );

    app.get("/api/health", (req, res) => {
        const io = app.locals.io;
        res.json({
            status: dbBootstrapState.done ? "OK" : "INITIALIZING",
            platform: isVercel ? "vercel" : isHeroku ? "heroku" : "local",
            uptime: process.uptime(),
            redis: dbBootstrapState.done ? cacheManager.isReady() : false,
            socketIO: !!io,
            socketMetrics: io ? {
                users: io.userStore.list(),
            } : null,
            timestamp: Date.now(),
            env: process.env.NODE_ENV,
            bootstrapDone: dbBootstrapState.done,
            bootstrapError: dbBootstrapState.error?.message || null,
        });
    });

    // Bootstrap Middleware - Wait for initialization
    const ensureDBBootstrap = async (req, res, next) => {
        if (dbBootstrapState.done) {
            return next();
        }

        try {
            await initializeDBBootstrap();
            next();
        } catch (error) {
            return res.status(503).json({
                status: "Service Unavailable",
                message: "Database initialization failed",
                error: error.message,
            });
        }
    };

    // Apply to all API routes
    app.use("/api", ensureDBBootstrap);

    // Socket.io Setup (only for non-serverless environments)
    if (!isServerless) {

        const server = http.createServer(app);
        const io = initSocket(server);

        // Add socket.io to app.locals for use in routes
        app.locals.io = io;

        app.use((req, res, next) => {
            req.io = io;
            next();
        });

        app.locals.server = server;
    }

    // Mount API Routes
    mountRoutes(app);

    // 404 Handler
    app.use((req, res) =>
        handleError(res, {
            status: 404,
            message: `Route ${req.url} not found`,
        })
    );

    // Global Error Handler
    app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
        // console.error("❌ Error:", err);

        const isDev = process.env.NODE_ENV !== "production";

        const safeError = {
            name: err.name || "Error",
            message: err.message || "Internal Server Error",
            status: err.status || 500,
            code: err.code,
            ...(isDev && { stack: err.stack }),
        };

        handleError(res, safeError);
    });

    return app;
}

// Server Startup (for non-serverless environments)
async function startServer() {
    const app = createApp();
    const server = app.locals.server || http.createServer(app);

    try {
        // Initialize bootstrap before starting server
        await initializeDBBootstrap();

        const port = Number(process.env.PORT || 5000);

        const startListening = (currentPort) => {
            server.listen(currentPort, () => {
                console.log(`🚀 Server running on port ${currentPort}`);
                console.log(`   Platform: ${isHeroku ? "Heroku" : "Local"}`);
                console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
            });
        };

        server.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
                console.warn(`⚠️  Port ${port} in use`);
                if (!isHeroku) {
                    const newPort = port + 1;
                    console.log(`   Retrying on port ${newPort}...`);
                    return startListening(newPort);
                }
            }
            console.error("❌ Server error:", err);
            process.exit(1);
        });

        startListening(port);

    } catch (error) {
        console.error("❌ Failed to start server:", error);
        process.exit(1);
    }
}

// Graceful Shutdown
function setupGracefulShutdown(server) {
    const shutdown = async (signal) => {
        console.log(`\n${signal} received. Starting graceful shutdown...`);

        server.close(() => {
            console.log("✅ HTTP server closed");
        });

        // Close connections
        if (cacheManager && typeof cacheManager.disconnect === "function") {
            await cacheManager.disconnect();
        }

        setTimeout(() => {
            console.error("⚠️  Forced shutdown after timeout");
            process.exit(1);
        }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
}

// Execution Logic
if (isServerless) {
    // Vercel: Export app directly, bootstrap on first request
    module.exports = createApp();
} else {
    // Heroku/Local: Start traditional server
    const app = createApp();
    const server = app.locals.server || http.createServer(app);

    setupGracefulShutdown(server);
    startServer();

    module.exports = app;
}