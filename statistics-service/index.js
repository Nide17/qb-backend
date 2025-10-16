const express = require('express')
const cors = require('cors')
const os = require('os');
const process = require('process');
const dotenv = require('dotenv')
const { handleError } = require('./utils/error')
const { corsOptions } = require('./utils/helpers')

// Config
dotenv.config()
const app = express()

// Middlewares
app.use(cors(corsOptions))
app.use(express.json())

// Routes
app.use("/api/statistics", require('./routes/statistics'))

// home route
app.get('/', (req, res) => { res.send('Welcome to QB statistics API') })

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        res.json({
            service: 'statistics-service',
            database: 'not-required',
            status: 'healthy',

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
        res.status(503).json({
            service: 'statistics-service',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Handle errors: takes res, err, status
app.use((err, req, res, next) => handleError(res, err))

app.listen(process.env.PORT || 5011, async () => {
    console.log(`Statistics service is running on port ${process.env.PORT || 5011}, No database required.`)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    app.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    app.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
