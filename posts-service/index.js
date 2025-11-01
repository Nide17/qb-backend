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
app.use('/api/adverts', require('./routes/adverts'));
app.use('/api/faqs', require('./routes/faqs'));
app.use('/api/blog-posts', require('./routes/blog-posts/blog-posts'));
app.use('/api/post-categories', require('./routes/blog-posts/post-categories'));
app.use('/api/image-uploads', require('./routes/blog-posts/image-uploads'));
app.use('/api/blog-posts-views', require('./routes/blog-posts/blog-posts-views'));

// home route
app.get('/', (req, res) => { res.send('Welcome to QB Posts API'); });

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const dbStatus = mongoose.connection.readyState === 1;
        const db = mongoose.connection.db;

        // ✅ Await the stats
        const stats = await db.stats();

        res.status(200).json({
            service: 'posts-service',
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
            service: 'posts-service',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Handle errors: takes res, err, status
app.use((err, req, res, _next) => handleError(res, err));

// Start server and connect to MongoDB
mongoose
    .connect(process.env.MONGODB_URI)
    .then(async (conn) => {
        app.listen(process.env.PORT || 5003, async () => {
            const db = conn.connection.db;
            console.log(`Posts service is running on port ${process.env.PORT || 5003}, and MongoDB ${db.databaseName} is connected`);
        });
    })
    .catch((err) => console.log(err));

