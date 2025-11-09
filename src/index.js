const express = require('express');
const http = require('http');
const cors = require('cors');
const process = require('process');
const { redisCache } = require('./utils/global-helpers');
const { handleError } = require('./utils/error');
const socketManager = require('./utils/enhanced-socket');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketManager.initialize(server);

app.use(express.json());
app.use(cors());

// Users
app.use('/api/users', require('./modules/users/routes/users'));
app.use('/api/subscribed-users', require('./modules/users/routes/subscribed-users'));

// Quizzing
app.use('/api/categories', require('./modules/quizzing/routes/categories'));
app.use('/api/quizzes', require('./modules/quizzing/routes/quizzes'));
app.use('/api/questions', require('./modules/quizzing/routes/questions'));

// Posts
app.use('/api/adverts', require('./modules/posts/routes/adverts'));
app.use('/api/faqs', require('./modules/posts/routes/faqs'));
app.use('/api/blog-posts', require('./modules/posts/routes/blog-posts/blog-posts'));
app.use('/api/post-categories', require('./modules/posts/routes/blog-posts/post-categories'));
app.use('/api/image-uploads', require('./modules/posts/routes/blog-posts/image-uploads'));
app.use('/api/blog-posts-views', require('./modules/posts/routes/blog-posts/blog-posts-views'));

// Schools
app.use('/api/schools', require('./modules/schools/routes/schools'));
app.use('/api/levels', require('./modules/schools/routes/levels'));
app.use('/api/faculties', require('./modules/schools/routes/faculties'));

// Courses
app.use('/api/course-categories', require('./modules/courses/routes/course-categories'));
app.use('/api/courses', require('./modules/courses/routes/courses'));
app.use('/api/chapters', require('./modules/courses/routes/chapters'));
app.use('/api/notes', require('./modules/courses/routes/notes'));

// Scores
app.use('/api/scores', require('./modules/scores/routes/scores'));

// Downloads
app.use('/api/downloads', require('./modules/downloads/routes/downloads'));

// Contacts
app.use('/api/contacts', require('./modules/contacts/routes/contacts'));
app.use('/api/broadcasts', require('./modules/contacts/routes/broadcasts'));
app.use('/api/chat-rooms', require('./modules/contacts/routes/chat-rooms'));
app.use('/api/room-messages', require('./modules/contacts/routes/room-messages'));

// Feedbacks
app.use('/api/feedbacks', require('./modules/feedbacks/routes/feedbacks'));

// Comments
app.use('/api/quizzes-comments', require('./modules/comments/routes/quizzes-comments'));
app.use('/api/questions-comments', require('./modules/comments/routes/questions-comments'));

// Statistics
app.use('/api/statistics', require('./modules/statistics/routes/statistics'));

// Enhanced Health Check with Status and Metrics
app.get('/api/health', async (req, res) => {
    res.status(200).json({});
});

// Metrics endpoint
app.get('/api/metrics', (req, res) => {
    res.status(200).json({});
});

// 404 Route Not Found
app.use((req, res, _next) => {
    if (!res.headersSent) {
        handleError(res, { status: 404, message: `Route ${req.url} does not exist` });
        return;
    }
});

console.log('🔌 Enhanced Socket.IO manager initialized');
console.log('✨ Features: Real-time chat, quiz sessions, user presence, private messaging');

// Middleware to attach socket.io to requests
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Port
const PORT = process.env.PORT || 5000;

// Initialize Redis connection and start server
async function startServer() {
    try {

        server.listen(PORT, () => {
            console.log(`🚀 Server with Socket.io running on port ${PORT}`);
        });

        try {
            await redisCache.connect()
        } catch (error) {
            console.log(`Redis error: ${error?.message || error}`);
        }
    } catch (err) {
        console.error('Failed to start server:\n', err?.message || err);
    }
}

startServer();

// Handle errors: takes res, err, status
app.use((err, req, res, _next) => handleError(res, err));
