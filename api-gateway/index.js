const express = require('express');
const http = require('http');
const cors = require('cors');
const os = require('os')
const process = require('process')
const { routeToService, callService, setCachedData, getCachedData, redisCache, memoryCache } = require('./utils/helpers');
const { handleError } = require('./utils/error');
const HealthMonitor = require('./utils/health-monitor');
const socketManager = require('./utils/enhanced-socket');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketManager.initialize(server);

app.use(express.json());
app.use(cors());

// Users Service
app.use('/api/users', routeToService('Users', process.env.USERS_SERVICE_URL));
app.use('/api/users/admins-emails', routeToService('Users', process.env.USERS_SERVICE_URL));
app.use('/api/subscribed-users', routeToService('Users', process.env.USERS_SERVICE_URL));

// Quizzing Service
app.use('/api/categories', routeToService('Quizzing', process.env.QUIZZING_SERVICE_URL));
app.use('/api/quizzes', routeToService('Quizzing', process.env.QUIZZING_SERVICE_URL));
app.use('/api/questions', routeToService('Quizzing', process.env.QUIZZING_SERVICE_URL));

// Posts Service
app.use('/api/adverts', routeToService('Posts', process.env.POSTS_SERVICE_URL));
app.use('/api/faqs', routeToService('Posts', process.env.POSTS_SERVICE_URL));
app.use('/api/blog-posts', routeToService('Posts', process.env.POSTS_SERVICE_URL));
app.use('/api/post-categories', routeToService('Posts', process.env.POSTS_SERVICE_URL));
app.use('/api/image-uploads', routeToService('Posts', process.env.POSTS_SERVICE_URL));
app.use('/api/blog-posts-views', routeToService('Posts', process.env.POSTS_SERVICE_URL));

// Schools Service
app.use('/api/schools', routeToService('Schools', process.env.SCHOOLS_SERVICE_URL));
app.use('/api/levels', routeToService('Schools', process.env.SCHOOLS_SERVICE_URL));
app.use('/api/faculties', routeToService('Schools', process.env.SCHOOLS_SERVICE_URL));

// Courses Service
app.use('/api/course-categories', routeToService('Courses', process.env.COURSES_SERVICE_URL));
app.use('/api/courses', routeToService('Courses', process.env.COURSES_SERVICE_URL));
app.use('/api/chapters', routeToService('Courses', process.env.COURSES_SERVICE_URL));
app.use('/api/notes', routeToService('Courses', process.env.COURSES_SERVICE_URL));

// Scores Service
app.use('/api/scores', routeToService('Scores', process.env.SCORES_SERVICE_URL));

// Downloads Service
app.use('/api/downloads', routeToService('Downloads', process.env.DOWNLOADS_SERVICE_URL));

// Contacts Service
app.use('/api/contacts', routeToService('Contacts', process.env.CONTACTS_SERVICE_URL));
app.use('/api/broadcasts', routeToService('Contacts', process.env.CONTACTS_SERVICE_URL));
app.use('/api/chat-rooms', routeToService('Contacts', process.env.CONTACTS_SERVICE_URL));
app.use('/api/room-messages', routeToService('Contacts', process.env.CONTACTS_SERVICE_URL));

// Feedbacks Service
app.use('/api/feedbacks', routeToService('Feedbacks', process.env.FEEDBACKS_SERVICE_URL));

// Comments Service
app.use('/api/quizzes-comments', routeToService('Comments', process.env.COMMENTS_SERVICE_URL));
app.use('/api/questions-comments', routeToService('Comments', process.env.COMMENTS_SERVICE_URL));

// Statistics Service
app.use('/api/statistics', routeToService('Statistics', process.env.STATISTICS_SERVICE_URL));

// Health Check Endpoint
app.get('/', (req, res) => {
    res.send({
        status: 'API Gateway is running',
        version: '2.0.0',
        features: ['data-aggregation', 'caching', 'health-monitoring'],
        endpoints: {
            aggregated: [
                '/api/aggregated/quiz/:id',
                '/api/aggregated/quizzes',
                '/api/aggregated/dashboard',
                '/api/aggregated/user/:id',
                '/api/aggregated/category/:id',
                '/api/aggregated/search'
            ],
            health: '/api/health'
        }
    });
});


// Enhanced Data Aggregation Endpoints
app.get('/api/aggregated/quiz/:id', async (req, res) => {
    try {
        const cacheKey = `quiz_${req.params.id}`;
        const cached = await getCachedData(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Fetch quiz with all related data
        const [quizRes, categoryRes, questionsRes, commentsRes, scoresRes] = await Promise.allSettled([
            callService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes/${req.params.id}`),
            callService(`${process.env.QUIZZING_SERVICE_URL}/api/categories`),
            callService(`${process.env.QUIZZING_SERVICE_URL}/api/questions`),
            callService(`${process.env.COMMENTS_SERVICE_URL}/api/quizzes-comments?quiz=${req.params.id}`),
            callService(`${process.env.SCORES_SERVICE_URL}/api/scores?quiz=${req.params.id}`)
        ]);

        const quiz = quizRes.status === 'fulfilled' ? quizRes.value.data : null;
        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        // Aggregate data
        const aggregatedData = {
            ...quiz,
            category: categoryRes.status === 'fulfilled' ?
                categoryRes.value.data.find(cat => cat._id === quiz.category) : null,
            questions: questionsRes.status === 'fulfilled' ?
                questionsRes.value.data.filter(q => quiz.questions.includes(q._id)) : [],
            comments: commentsRes.status === 'fulfilled' ? commentsRes.value.data : [],
            scores: scoresRes.status === 'fulfilled' ? scoresRes.value.data : [],
            _aggregated: true,
            _cached: false
        };

        await setCachedData(cacheKey, aggregatedData);
        res.json(aggregatedData);
    } catch (error) {
        console.error('Error aggregating quiz data:\n', error);
        handleError(res, error);
    }
});

app.get('/api/aggregated/quizzes', async (req, res) => {
    try {
        const { page = 1, limit = 12, category, search, difficulty, created_by } = req.query;
        const cacheKey = `quizzes_${page}_${limit}_${category}_${search}_${difficulty}_${created_by}`;
        const cached = await getCachedData(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Build query parameters
        const queryParams = new URLSearchParams();
        if (page) queryParams.append('pageNo', page);
        if (limit) queryParams.append('limit', limit);
        if (category) queryParams.append('category', category);
        if (search) queryParams.append('search', search);
        if (difficulty) queryParams.append('difficulty', difficulty);
        if (created_by) queryParams.append('created_by', created_by);

        const [quizzesRes, categoriesRes, usersRes] = await Promise.allSettled([
            callService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes?${queryParams}`),
            callService(`${process.env.QUIZZING_SERVICE_URL}/api/categories`),
            callService(`${process.env.USERS_SERVICE_URL}/api/users`)
        ]);

        if (quizzesRes.status === 'rejected') {
            handleError(res, quizzesRes.reason);
        }

        const quizzes = quizzesRes.value.data;
        const categories = categoriesRes.status === 'fulfilled' ? categoriesRes.value.data : [];
        const users = usersRes.status === 'fulfilled' ? usersRes.value.data : [];

        // Enhance quizzes with category names, user info, and basic stats
        const enhancedQuizzes = quizzes.quizzes ? quizzes.quizzes.map(quiz => ({
            ...quiz,
            categoryName: categories.find(cat => cat._id === quiz.category)?.name || 'Unknown',
            categorySlug: categories.find(cat => cat._id === quiz.category)?.slug || '',
            creatorName: users.find(user => user._id === quiz.created_by)?.name || 'Unknown',
            questionCount: quiz.questions?.length || 0,
            estimatedTime: (quiz.questions?.length || 0) * 2, // 2 minutes per question
            difficulty: quiz.difficulty || 'medium'
        })) : [];

        const aggregatedData = {
            ...quizzes,
            quizzes: enhancedQuizzes,
            categories: categories,
            _aggregated: true,
            _cached: false
        };

        await setCachedData(cacheKey, aggregatedData);
        res.json(aggregatedData);
    } catch (error) {
        console.error('Error aggregating quizzes data:\n', error);
        handleError(res, error);
    }
});

app.get('/api/aggregated/dashboard', async (req, res) => {
    try {
        const cacheKey = 'dashboard_stats';
        const cached = await getCachedData(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Fetch dashboard statistics from multiple services
        const [quizzesRes, usersRes, coursesRes, postsRes, scoresRes, feedbacksRes] = await Promise.allSettled([
            callService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes`),
            callService(`${process.env.USERS_SERVICE_URL}/api/users`),
            callService(`${process.env.COURSES_SERVICE_URL}/api/courses`),
            callService(`${process.env.POSTS_SERVICE_URL}/api/blog-posts`),
            callService(`${process.env.SCORES_SERVICE_URL}/api/scores`),
            callService(`${process.env.FEEDBACKS_SERVICE_URL}/api/feedbacks`)
        ]);

        const dashboardData = {
            totalQuizzes: quizzesRes.status === 'fulfilled' ? quizzesRes.value.data.length : 0,
            totalUsers: usersRes.status === 'fulfilled' ? usersRes.value.data.length : 0,
            totalCourses: coursesRes.status === 'fulfilled' ? coursesRes.value.data.length : 0,
            totalPosts: postsRes.status === 'fulfilled' ? postsRes.value.data.length : 0,
            totalScores: scoresRes.status === 'fulfilled' ? scoresRes.value.data.length : 0,
            totalFeedbacks: feedbacksRes.status === 'fulfilled' ? feedbacksRes.value.data.length : 0,
            _aggregated: true,
            _cached: false,
            lastUpdated: new Date().toISOString()
        };

        await setCachedData(cacheKey, dashboardData);
        res.json(dashboardData);
    } catch (error) {
        console.error('Error aggregating dashboard data:\n', error);
        handleError(res, error);
    }
});

// New aggregated endpoints
app.get('/api/aggregated/user/:id', async (req, res) => {
    try {
        const cacheKey = `user_${req.params.id}`;
        const cached = await getCachedData(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const [userRes, scoresRes, quizzesRes, commentsRes] = await Promise.allSettled([
            callService(`${process.env.USERS_SERVICE_URL}/api/users/${req.params.id}`),
            callService(`${process.env.SCORES_SERVICE_URL}/api/scores?user=${req.params.id}`),
            callService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes?created_by=${req.params.id}`),
            callService(`${process.env.COMMENTS_SERVICE_URL}/api/quizzes-comments?user=${req.params.id}`)
        ]);

        const user = userRes.status === 'fulfilled' ? userRes.value.data : null;
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const aggregatedData = {
            ...user,
            scores: scoresRes.status === 'fulfilled' ? scoresRes.value.data : [],
            createdQuizzes: quizzesRes.status === 'fulfilled' ? quizzesRes.value.data : [],
            comments: commentsRes.status === 'fulfilled' ? commentsRes.value.data : [],
            stats: {
                totalScores: scoresRes.status === 'fulfilled' ? scoresRes.value.data.length : 0,
                totalQuizzes: quizzesRes.status === 'fulfilled' ? quizzesRes.value.data.length : 0,
                totalComments: commentsRes.status === 'fulfilled' ? commentsRes.value.data.length : 0,
                averageScore: scoresRes.status === 'fulfilled' && scoresRes.value.data.length > 0
                    ? scoresRes.value.data.reduce((acc, score) => acc + score.score, 0) / scoresRes.value.data.length
                    : 0
            },
            _aggregated: true,
            _cached: false
        };

        await setCachedData(cacheKey, aggregatedData);
        res.json(aggregatedData);
    } catch (error) {
        console.error('Error aggregating user data:\n', error);
        handleError(res, error);
    }
});

app.get('/api/aggregated/category/:id', async (req, res) => {
    try {
        const cacheKey = `category_${req.params.id}`;
        const cached = await getCachedData(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const [categoryRes, quizzesRes, questionsRes] = await Promise.allSettled([
            callService(`${process.env.QUIZZING_SERVICE_URL}/api/categories/${req.params.id}`),
            callService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes?category=${req.params.id}`),
            callService(`${process.env.QUIZZING_SERVICE_URL}/api/questions`)
        ]);

        const category = categoryRes.status === 'fulfilled' ? categoryRes.value.data : null;
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const quizzes = quizzesRes.status === 'fulfilled' ? quizzesRes.value.data : [];
        const questions = questionsRes.status === 'fulfilled' ? questionsRes.value.data : [];

        const aggregatedData = {
            ...category,
            quizzes: quizzes,
            questions: questions.filter(q => quizzes.some(quiz => quiz.questions.includes(q._id))),
            stats: {
                totalQuizzes: quizzes.length,
                totalQuestions: questions.filter(q => quizzes.some(quiz => quiz.questions.includes(q._id))).length,
                averageDifficulty: quizzes.length > 0
                    ? quizzes.reduce((acc, quiz) => acc + (quiz.difficulty || 1), 0) / quizzes.length
                    : 0
            },
            _aggregated: true,
            _cached: false
        };

        await setCachedData(cacheKey, aggregatedData);
        res.json(aggregatedData);
    } catch (error) {
        console.error('Error aggregating category data:\n', error);
        handleError(res, error);
    }
});

app.get('/api/aggregated/search', async (req, res) => {
    try {
        const { q: query, type, page = 1, limit = 20 } = req.query;
        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const cacheKey = `search_${query}_${type}_${page}_${limit}`;
        const cached = await getCachedData(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const searchPromises = [];

        if (!type || type === 'quizzes') {
            searchPromises.push(callService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes?search=${query}&pageNo=${page}&limit=${limit}`));
        }
        if (!type || type === 'users') {
            searchPromises.push(callService(`${process.env.USERS_SERVICE_URL}/api/users?search=${query}&pageNo=${page}&limit=${limit}`));
        }
        if (!type || type === 'posts') {
            searchPromises.push(callService(`${process.env.POSTS_SERVICE_URL}/api/blog-posts?search=${query}&pageNo=${page}&limit=${limit}`));
        }
        if (!type || type === 'courses') {
            searchPromises.push(callService(`${process.env.COURSES_SERVICE_URL}/api/courses?search=${query}&pageNo=${page}&limit=${limit}`));
        }

        const results = await Promise.allSettled(searchPromises);

        const aggregatedData = {
            query,
            type: type || 'all',
            results: {
                quizzes: type === 'quizzes' || !type ? (results[0]?.status === 'fulfilled' ? results[0].value.data : []) : [],
                users: type === 'users' || !type ? (results[1]?.status === 'fulfilled' ? results[1].value.data : []) : [],
                posts: type === 'posts' || !type ? (results[2]?.status === 'fulfilled' ? results[2].value.data : []) : [],
                courses: type === 'courses' || !type ? (results[3]?.status === 'fulfilled' ? results[3].value.data : []) : []
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            },
            _aggregated: true,
            _cached: false
        };

        await setCachedData(cacheKey, aggregatedData);
        res.json(aggregatedData);
    } catch (error) {
        console.error('Error performing search:\n', error);
        handleError(res, error);
    }
});

// Enhanced Health Check with Service Status and Metrics
app.get('/api/health', async (req, res) => {
    const services = {
        'Users': process.env.USERS_SERVICE_URL,
        'Quizzing': process.env.QUIZZING_SERVICE_URL,
        'Posts': process.env.POSTS_SERVICE_URL,
        'Schools': process.env.SCHOOLS_SERVICE_URL,
        'Courses': process.env.COURSES_SERVICE_URL,
        'Scores': process.env.SCORES_SERVICE_URL,
        'Downloads': process.env.DOWNLOADS_SERVICE_URL,
        'Contacts': process.env.CONTACTS_SERVICE_URL,
        'Feedbacks': process.env.FEEDBACKS_SERVICE_URL,
        'Comments': process.env.COMMENTS_SERVICE_URL,
        'Statistics': process.env.STATISTICS_SERVICE_URL
    };

    const healthMonitor = new HealthMonitor();
    const healthReport = await healthMonitor.getHealthReport(services);

    // Add cache information
    healthReport.cache = {
        redis: {
            connected: redisCache.isConnected,
            stats: await redisCache.getStats()
        },
        memory: {
            size: memoryCache.size,
            keys: Array.from(memoryCache.keys())
        }
    };

    res.json(healthReport);
});

// Metrics endpoint
app.get('/api/metrics', (req, res) => {

    const healthMonitor = new HealthMonitor();
    const metrics = healthMonitor.getMetricsSummary();
    const systemMetrics = healthMonitor.getSystemMetrics();

    res.json({
        ...metrics,
        system: systemMetrics,
        timestamp: new Date().toISOString()
    });
});

// 404 Route Not Found
app.use((req, res, next) => {
    if (!res.headersSent) {
        res.status(404).send({ error: `Route ${req.url} does not exist` });
    }
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err.stack);
    console.error('Error details:', err);

    // Only send response if headers haven't been sent yet
    if (!res.headersSent) {
        res.status(err.status || 500).json({
            success: false,
            error: err.message || 'Internal Server Error',
            code: 'INTERNAL_SERVER_ERROR',
            timestamp: new Date().toISOString()
        });
    }
});

// Socket.io connection handling is now managed by the enhanced socket manager
// All socket events, rooms, and features are handled automatically
// The socket manager provides improved real-time features including:
// - User presence and online status
// - Private messaging
// - Room-based chat with typing indicators
// - Real-time quiz sessions with leaderboards
// - Connection management and error handling
// - Performance monitoring and statistics

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
        // Connect to Redis
        await redisCache.connect();

        server.listen(PORT, () => {
            console.log(`🚀 API Gateway with Socket.io running on port ${PORT}`);
            console.log('📡 Ready to route requests to microservices');
            console.log(`📦 Redis cache: ${redisCache.isConnected ? 'Connected' : 'Disconnected'}`);
        });
    } catch (error) {
        console.error('Failed to start server:\n', error);
        process.exit(1);
    }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await mongoose.connection.close();
    await redisCache.disconnect();
    app.close(() => {
        console.log('Server closed');
        io.close();
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await mongoose.connection.close();
    await redisCache.disconnect();
    app.close(() => {
        console.log('Server closed');
        io.close();
        process.exit(0);
    });
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});
