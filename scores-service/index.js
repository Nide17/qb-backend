const express = require('express')
const mongoose = require('mongoose')
const os = require('os')
const process = require('process')
const cors = require('cors')
const compression = require('compression')
const dotenv = require('dotenv')
const { handleError, startMemoryMonitoring } = require('./utils/error')
const { corsOptions } = require('./utils/helpers')
const { memoryMonitorMiddleware, requestTrackerMiddleware, startMemoryMonitoring: startMiddlewareMonitoring } = require('./middlewares/memory-monitor')

// Config
dotenv.config()
const app = express()

// Middlewares
app.use(cors(corsOptions))
app.use(express.json())
app.use(compression())

// Memory monitoring middleware
app.use(requestTrackerMiddleware)
app.use(memoryMonitorMiddleware)

// Routes
app.use("/api/scores", require('./routes/scores'))

// home route
app.get('/', (req, res) => { res.send('Welcome to QB scores API') })

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const dbStatus = mongoose.connection.readyState === 1;
        const db = mongoose.connection.db;

        // ✅ Await the stats
        const stats = await db.stats();

        res.json({
            service: 'scores-service',
            status: 'healthy',
            database: dbStatus ? 'connected' : 'disconnected',
            dbStats: {
                name: db.databaseName,
                collections: stats.collections,
                objects: stats.objects,
                dataSize: stats.dataSize,
                storageSize: stats.storageSize,
                indexSize: stats.indexSize,
            },

            // --- System Information ---
            system: {
                os: os.type(),
                platform: os.platform(),
                architecture: os.arch(),
                cpus: os.cpus().length,
                totalMemory: os.totalmem(),
                freeMemory: os.freemem(),
                timestamp: new Date().toISOString(),
                uptime: os.uptime(),
                nodeVersion: process.version,
                env: process.env.NODE_ENV || 'development'
            },

            // --- Process Information ---
            process: {
                execPath: process.execPath,
                execArgv: process.execArgv,
                cwd: process.cwd(),
                argv: process.argv,
                uptime: process.uptime(),
                pid: process.pid,
                title: process.title,
                platform: process.platform,
                memoryUsage: process.memoryUsage(),
                cpuUsage: process.cpuUsage(),
            }
        });
    } catch (error) {
        console.error('Error in /health route:', error);

        res.status(503).json({
            service: 'scores-service',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Handle errors: takes res, err, status
app.use((err, req, res, next) => handleError(res, err))

// Connect to MongoDB and start server
mongoose
    .connect(process.env.MONGODB_URI)
    .then(async (conn) => {
        app.listen(process.env.PORT || 5006, async () => {
            const db = conn.connection.db
            console.log(`Scores service is running on port ${process.env.PORT || 5006}, and MongoDB ${db.databaseName} is connected`)

            // Start memory monitoring
            startMemoryMonitoring()
            startMiddlewareMonitoring()

            console.log('📊 Memory monitoring started')
        })
    })
    .catch((err) => console.log(err))

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await mongoose.connection.close();
    app.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await mongoose.connection.close();
    app.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
