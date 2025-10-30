
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const os = require('os');
const process = require('process');
const { createServer } = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const contactsSocketManager = require('./utils/enhanced-socket');
const { handleError } = require('./utils/error');

// Config
dotenv.config();
const app = express();
const httpServer = createServer(app);

// Middlewares
app.use(express.json());
app.use(cors());
app.options('*', cors());

// Routes
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/broadcasts', require('./routes/broadcasts'));
app.use('/api/chat-rooms', require('./routes/chat-rooms'));
app.use('/api/room-messages', require('./routes/room-messages'));

// home route
app.get('/', (req, res) => { res.send('Welcome to QB contacts API'); });

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const dbStatus = mongoose.connection.readyState === 1;
        const db = mongoose.connection.db;

        // ✅ Await the stats
        const stats = await db.stats();

        res.status(200).json({
            service: 'contacts-service',
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
            service: 'contacts-service',
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Handle errors: takes res, err, status
app.use((err, req, res, _next) => handleError(res, err));

// Database connection and server start
mongoose
    .connect(process.env.MONGODB_URI)
    .then(async (conn) => {
        httpServer.listen(process.env.PORT || 5008, async () => {
            const db = conn.connection.db;
            console.log(`Contacts service is running on port ${process.env.PORT || 5008}, and MongoDB ${db.databaseName} is connected`);

            // Initialize Socket.io with enhanced contacts functionality
            const io = new Server(httpServer, {
                transports: ['websocket', 'polling'],
                cors: {
                    // Allow all origins for development
                    origin: '*',
                    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                }
            });

            contactsSocketManager.initialize(io);
            console.log('🔌 Enhanced contacts socket manager initialized');
        });
    })
    .catch((err) => {
        console.error('Failed to connect to MongoDB:', err);
    });

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
