const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const os = require('os');
const process = require('process');
const dotenv = require('dotenv');
const { handleError } = require('./utils/error');

// Config
dotenv.config();
const app = express();

// Middlewares
app.use(express.json());
app.use(cors());
app.options('*', cors());

// Routes
app.use('/api/categories', require('./routes/categories'));
app.use('/api/quizzes', require('./routes/quizzes'));
app.use('/api/questions', require('./routes/questions'));

// home route
app.get('/', (req, res) => {
    res.send({
        service: 'QB Quizzing API',
        version: '2.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
    });
});

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const dbStatus = mongoose.connection.readyState === 1;
        const db = mongoose.connection.db;

        // ✅ Await the stats
        const stats = await db.stats();

        res.status(200).json({
            service: 'quizzing-service',
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
            service: 'quizzing-service',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Handle errors: takes res, err, status
app.use((err, req, res, _next) => handleError(res, err));

// Connection helper with retries and event handlers so the service recovers when Mongo restarts
let server = null;
let serverStarted = false;

const mongooseOpts = {
    // useUnifiedTopology handles monitoring servers and reconnects
    useNewUrlParser: true,
    useUnifiedTopology: true,
    // sensible timeouts
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
};

const startServerIfNeeded = (conn) => {
    if (serverStarted) return;
    server = app.listen(process.env.PORT || 5002, () => {
        serverStarted = true;
        const db = conn && conn.connection && conn.connection.db;
        console.log(`Quizzing service is running on port ${process.env.PORT || 5002}${db ? `, and MongoDB ${db.databaseName} is connected` : ''}`);
    });
};

const connectWithRetry = () => {
    mongoose.connect(process.env.MONGODB_URI, mongooseOpts)
        .then(conn => {
            console.log('MongoDB connection established');
            startServerIfNeeded(conn);
        })
        .catch(err => {
            console.error('MongoDB connection error, retrying in 5s', err.message || err);
            setTimeout(connectWithRetry, 5000);
        });
};

// connection event handlers for visibility and auto-reconnect attempts
mongoose.connection.on('connected', () => console.log('Mongoose connected'));
mongoose.connection.on('reconnected', () => console.log('Mongoose reconnected'));
mongoose.connection.on('error', err => console.error('Mongoose connection error', err));
mongoose.connection.on('disconnected', () => {
    console.error('Mongoose disconnected — attempting reconnect');
    // attempt reconnect (connectWithRetry already uses retries)
    connectWithRetry();
});

// Start the initial connection attempt
connectWithRetry();


// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await mongoose.connection.close();
    if (server) {
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await mongoose.connection.close();
    if (server) {
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});
