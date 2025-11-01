const express = require('express');
const mongoose = require('mongoose');
const os = require('os');
const process = require('process');
const cors = require('cors');
const { handleError } = require('./utils/error');
const dotenv = require('dotenv');

// Config
dotenv.config();
const app = express();

// Middlewares
app.use(express.json());
app.use(cors());
app.options('*', cors());

// Routes
app.use('/api/course-categories', require('./routes/course-categories'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/chapters', require('./routes/chapters'));
app.use('/api/notes', require('./routes/notes'));

// home route
app.get('/', (req, res) => { res.send('Welcome to QB courses API'); });

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const dbStatus = mongoose.connection.readyState === 1;
        const db = mongoose.connection.db;

        // ✅ Await the stats
        const stats = await db.stats();

        res.status(200).json({
            service: 'courses-service',
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
            service: 'courses-service',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Handle errors: takes res, err, status
app.use((err, req, res, _next) => handleError(res, err));

mongoose
    .connect(process.env.MONGODB_URI)
    .then(async (conn) => {
        app.listen(process.env.PORT || 5005, async () => {
            const db = conn.connection.db;
            console.log(`Courses service is running on port ${process.env.PORT || 5005}, and MongoDB ${db.databaseName} is connected`);
        });
    })
    .catch((err) => console.log(err));
    