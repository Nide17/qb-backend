const os = require('os');
const process = require('process');
const { handleError } = require('../utils/error');
const { getCachedData, setCachedData, callService, checkAllServicesHealth } = require('../utils/helpers');

// Enhanced system monitoring
exports.getSystemMetrics = async (req, res) => {
    const cacheKey = 'system_metrics';

    try {
        let metrics = getCachedData(cacheKey);

        // if (!metrics) {
            // Get system information
            const cpuUsage = process.cpuUsage();
            const memoryUsage = process.memoryUsage();
            const systemInfo = {
                platform: os.platform(),
                arch: os.arch(),
                cpus: os.cpus().length,
                totalMemory: os.totalmem(),
                freeMemory: os.freemem(),
                uptime: os.uptime(),
            };

            // Get service health status - Monitor all services
            const services = [
                { name: 'users-service', url: `${process.env.USERS_SERVICE_URL}` },
                { name: 'quizzing-service', url: `${process.env.QUIZZING_SERVICE_URL}` },
                { name: 'posts-service', url: `${process.env.POSTS_SERVICE_URL}` },
                { name: 'schools-service', url: `${process.env.SCHOOLS_SERVICE_URL}` },
                { name: 'courses-service', url: `${process.env.COURSES_SERVICE_URL}` },
                { name: 'scores-service', url: `${process.env.SCORES_SERVICE_URL}` },
                { name: 'downloads-service', url: `${process.env.DOWNLOADS_SERVICE_URL}` },
                { name: 'contacts-service', url: `${process.env.CONTACTS_SERVICE_URL}` },
                { name: 'feedbacks-service', url: `${process.env.FEEDBACKS_SERVICE_URL}` },
                { name: 'comments-service', url: `${process.env.COMMENTS_SERVICE_URL}` },
                { name: 'statistics-service', url: `${process.env.STATISTICS_SERVICE_URL}` },
            ];

            const serviceHealthChecks = await Promise.allSettled(
                services.map(service =>
                    callService(`${service.url}/health`, { timeout: 200000 })
                )
            );

            const serviceHealth = serviceHealthChecks.map((result, index) => ({
                service: services[index].name,
                status: result.status === 'fulfilled' && result.value && result.value.status === 'healthy' ? 'healthy' : 'unhealthy',
                uptime: result.status === 'fulfilled' && result.value && result.value.uptime ? result.value.uptime || 0 : 0
            }));

            metrics = {
                timestamp: new Date().toISOString(),
                system: {
                    ...systemInfo,
                    memoryUsagePercent: ((systemInfo.totalMemory - systemInfo.freeMemory) / systemInfo.totalMemory * 100).toFixed(2),
                    process: {
                        pid: process.pid,
                        uptime: process.uptime(),
                        memoryUsage: {
                            rss: (memoryUsage.rss / 1024 / 1024).toFixed(2) + ' MB',
                            heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
                            heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
                            external: (memoryUsage.external / 1024 / 1024).toFixed(2) + ' MB'
                        },
                        cpuUsage: {
                            user: cpuUsage.user,
                            system: cpuUsage.system
                        }
                    }
                },
                services: serviceHealth
            };
            setCachedData(cacheKey, metrics);
        // }

        console.log("metrics: ", metrics)
        res.json(metrics);
    } catch (error) {
        console.log('\n\nError retrieving system metrics:', error);
        handleError(res, error);
    }
};

// Aggregated dashboard statistics endpoint
exports.getDashboardStats = async (req, res) => {

    const cacheKey = 'dashboard_stats';

    try {
        let stats = getCachedData(cacheKey);

        // if (!stats) {

            const serviceHealth = await checkAllServicesHealth();

            // Get actual data from working endpoints and count them through API Gateway
            const [usersResponse, quizzesResponse, downloadsResponse, scoresResponse] = await Promise.allSettled([
                callService(`${process.env.USERS_SERVICE_URL}/api/users`),
                callService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes`),
                callService(`${process.env.DOWNLOADS_SERVICE_URL}/api/downloads`, { stats: true }),
                callService(`${process.env.SCORES_SERVICE_URL}/api/scores`, { stats: true }),
            ]);

            // Handle users count with graceful fallback
            let totalUsers = 0;
            let usersError = false;
            if (usersResponse.status === 'fulfilled' && usersResponse.value && usersResponse.value && Array.isArray(usersResponse.value)) {
                totalUsers = usersResponse.value.length;
            } else {
                console.log('Users service unavailable, returning 0');
                usersError = true;
            }

            // Handle quizzes count with graceful fallback
            let totalQuizzes = 0;
            let quizzesError = false;
            if (quizzesResponse.status === 'fulfilled' && quizzesResponse.value && quizzesResponse.value && Array.isArray(quizzesResponse.value)) {
                totalQuizzes = quizzesResponse.value.length;
            } else {
                console.log('Quizzes service unavailable, returning 0');
                quizzesError = true;
            }

            // Handle downloads count with graceful fallback
            let totalDownloads = 0;
            let downloadsError = false;
            if (downloadsResponse.status === 'fulfilled' && downloadsResponse.value && downloadsResponse.value) {
                totalDownloads = downloadsResponse.value;
            } else {
                console.log('Downloads service unavailable, returning 0\n');
                downloadsError = true;
            }

            // Handle scores count with graceful fallback
            let totalScores = 0;
            let scoresError = false;
            if (scoresResponse.status === 'fulfilled' && scoresResponse.value && scoresResponse.value) {
                totalScores = scoresResponse.value;
            } else {
                console.log('Scores service unavailable, returning 0');
                scoresError = true;
            }

            stats = {
                totalUsers,
                totalQuizzes,
                totalDownloads,
                totalScores,
                serviceHealth,
                lastUpdated: new Date().toISOString(),
                errors: {
                    usersError,
                    quizzesError,
                    downloadsError,
                    scoresError,
                }
            };

            setCachedData(cacheKey, stats);
        // }

        res.json(stats);
    } catch (error) {
        console.log('\n\nError retrieving dashboard stats:', error);
        handleError(res, error);
    }
};

// Real-time statistics update endpoint
exports.updateDashboardStats = async (req, res) => {
    try {
        // Clear dashboard cache to force refresh
        cache.delete('dashboard_stats');

        // Emit real-time update if socket.io is available
        if (req.io) {
            const stats = await this.getDashboardStats({ query: {} }, { json: (data) => data });
            req.io.emit('dashboard-stats-update', {
                type: 'refresh',
                data: stats
            });
        }

        res.json({ message: 'Dashboard stats updated successfully' });
    } catch (error) {
        handleError(res, error);
    }
};

exports.get50NewUsers = async (req, res) => {
    const cacheKey = 'new_users_50';

    try {
        let users = getCachedData(cacheKey);

        if (!users) {
            console.log('No Cached users:', users);
            users = await callService(`${process.env.USERS_SERVICE_URL}/api/users`, { limit: 50 });
            setCachedData(cacheKey, users);
        }

        const filteredUsers = users

        res.status(200).json(filteredUsers);
    } catch (err) {
        console.log('Unexpected error in get50NewUsers:', err.message);
        res.status(503).json({
            success: false,
            message: 'Users temporarily unavailable',
            users: [],
            error: true,
            details: 'Unexpected error occurred',
            timestamp: new Date().toISOString()
        });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const users = await callService(`${process.env.USERS_SERVICE_URL}/api/users`);
        res.status(200).json(users);
    } catch (err) {
        console.log('Unexpected error in getAllUsers:', err.message);
        res.status(503).json({
            success: false,
            message: 'Users temporarily unavailable',
            users: [],
            error: true,
            details: 'Unexpected error occurred',
            timestamp: new Date().toISOString()
        });
    }
};

exports.getUsersWithImage = async (req, res) => {
    try {
        const users = await callService(`${process.env.USERS_SERVICE_URL}/api/users`, { filter: 'image' });

        if (!users) return res.status(404).json({ message: 'No users found with that image' });

        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithSchool = async (req, res) => {
    try {
        const users = await callService(`${process.env.USERS_SERVICE_URL}/api/users`, { filter: 'school' });

        if (!users) return res.status(404).json({ message: 'No users found with that school' });

        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithLevel = async (req, res) => {
    try {
        const users = await callService(`${process.env.USERS_SERVICE_URL}/api/users`, { filter: 'level' });

        if (!users) return res.status(404).json({ message: 'No users found with that level' });

        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithFaculty = async (req, res) => {
    try {
        const users = await callService(`${process.env.USERS_SERVICE_URL}/api/users`, { filter: 'faculty' });

        if (!users) return res.status(404).json({ message: 'No users found with that faculty' });

        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithYear = async (req, res) => {
    try {
        const users = await callService(`${process.env.USERS_SERVICE_URL}/api/users`, { filter: 'year' });

        if (!users) return res.status(404).json({ message: 'No users found with that year' });

        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithInterests = async (req, res) => {
    try {
        const users = await callService(`${process.env.USERS_SERVICE_URL}/api/users`, { filter: 'interests' });

        if (!users) return res.status(404).json({ message: 'No users found with that interest' });

        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithAbout = async (req, res) => {
    try {
        const users = await callService(`${process.env.USERS_SERVICE_URL}/api/users`, { filter: 'about' });

        if (!users) return res.status(404).json({ message: 'No users found with that about' });

        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getTop10QuizzingUsers = async (req, res) => {

    const cacheKey = 'top_10_quizzing_users';

    try {
        let quizStats = getCachedData(cacheKey);

        if (!quizStats) {
            quizStats = await callService(`${process.env.SCORES_SERVICE_URL}/api/scores`, { stats: true });

            if (quizStats) {
                setCachedData(cacheKey, quizStats);
                console.log('✅ Successfully fetched and cached quiz ranking statistics');
            }
        } else {
            console.log('📦 Returning cached quiz ranking statistics');
        }

        res.json(quizStats);
    } catch (err) {
        console.error('💥 Error in getTop10QuizzingUsers:', err.message)
        handleError(res, err);
    }
};

exports.getTop10Downloaders = async (req, res) => {
    const cacheKey = 'top_10_downloaders';

    try {
        let downloadStats = getCachedData(cacheKey);

        if (!downloadStats) {
            console.log('📊 Fetching download statistics...');

            downloadStats = await callService(`${process.env.DOWNLOADS_SERVICE_URL}/api/downloads`, { stats: true });

            setCachedData(cacheKey, downloadStats);
            console.log('✅ Successfully fetched and cached download statistics');
        } else {
            console.log('📦 Returning cached download statistics');
        }

        res.json(downloadStats);
    } catch (err) {
        console.error('💥 Error in getTop10Downloaders:', err.message);
        handleError(res, err);
    }
};

exports.getTop10Quizzes = async (req, res) => {
    const cacheKey = 'top_10_quizzes';

    try {
        let quizStatistics = getCachedData(cacheKey);

        if (!quizStatistics) {

            quizStatistics = await callService(`${process.env.SCORES_SERVICE_URL}/api/scores`, { stats: true });
            setCachedData(cacheKey, quizStatistics);
        }

        res.json(quizStatistics);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getTop10Notes = async (req, res) => {
    try {
        let top10 = await callService(`${process.env.DOWNLOADS_SERVICE_URL}/api/downloads`, { stats: true });
        res.json(top10);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getDailyUserRegistration = async (req, res) => {
    const cacheKey = 'daily_user_registration';

    try {
        let dailyReg = getCachedData(cacheKey);

        if (!dailyReg) {
            dailyReg = await callService(`${process.env.USERS_SERVICE_URL}/api/users/daily-user-registration`);
            setCachedData(cacheKey, dailyReg);
        }

        res.json(dailyReg);
    } catch (err) {
        handleError(res, err);
    }
};

// Real-time analytics endpoint
exports.getLiveAnalytics = async (req, res) => {
    const cacheKey = 'live_analytics';

    try {
        let analytics = getCachedData(cacheKey);

        if (!analytics) {
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            // Get today's statistics
            const [todayUsers, todayScores, todayDownloads] = await Promise.allSettled([
                callService(`${process.env.USERS_SERVICE_URL}/api/users`, {
                    params: { date_from: startOfDay.toISOString() }
                }),
                callService(`${process.env.SCORES_SERVICE_URL}/api/scores`, {
                    params: { date_from: startOfDay.toISOString() }
                }),
                callService(`${process.env.DOWNLOADS_SERVICE_URL}/api/downloads`, {
                    params: { date_from: startOfDay.toISOString() }
                })
            ]);

            analytics = {
                today: {
                    newUsers: todayUsers.status === 'fulfilled' ? todayUsers.value.length || 0 : 0,
                    newScores: todayScores.status === 'fulfilled' ? todayScores.value.length || 0 : 0,
                    newQuizzes: todayDownloads.status === 'fulfilled' ? todayDownloads.value.length || 0 : 0
                },
                timestamp: now.toISOString()
            };

            setCachedData(cacheKey, analytics);
        }

        res.json(analytics);
    } catch (error) {
        // console.log('\n\nError retrieving live analytics:', error);
        handleError(res, error);
    }
};

// Clear cache endpoint for admin use
exports.clearStatsCache = async (req, res) => {
    try {
        cache.clear();
        res.json({ message: 'Statistics cache cleared successfully' });
    } catch (error) {
        handleError(res, error);
    }
};
