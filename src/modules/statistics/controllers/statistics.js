const os = require('os');
const process = require('process');
const { handleError } = require('../../../utils/error');
const { getCachedData, setCachedData, getFromService, redisCache, deleteCacheKey } = require('../helpers');

// Enhanced system monitoring
exports.getSystemMetrics = async (req, res) => {

    const cacheKey = 'system_metrics';

    try {
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);

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

        const servicesHealthChecks = await Promise.allSettled(
            services.map(service =>
                getFromService(`${service.url}/health`, 200000)
            )
        );

        const servicesHealth = servicesHealthChecks.map((result, index) => ({
            service: services[index].name,
            status: result.status === 'fulfilled' && result.value && result?.value?.status === 'healthy' ? 'healthy' : 'unhealthy',
            uptime: result.status === 'fulfilled' && result.value && result?.value?.uptime ? result?.value?.uptime || 0 : 0
        }));

        let metrics = {
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
            services: servicesHealth
        };
        setCachedData(cacheKey, metrics);

        res.status(200).json(metrics);
    } catch (err) {
        handleError(res, err);
    }
};

// Aggregated dashboard statistics endpoint
exports.getDashboardStats = async (req, res) => {

    try {
        const cacheKey = 'dashboard_stats';
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);

        // Get actual data from working endpoints and count them through API Gateway
        const [usersResponse, quizzesResponse, downloadsResponse, scoresResponse] = await Promise.allSettled([
            getFromService(`${process.env.USERS_SERVICE_URL}/api/users`),
            getFromService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes`),
            getFromService(`${process.env.DOWNLOADS_SERVICE_URL}/api/downloads?filter=stats`),
            getFromService(`${process.env.SCORES_SERVICE_URL}/api/scores?filter=stats`),
        ]);

        // Handle users count with graceful fallback
        let totalUsers = 0;
        let usersError = false;
        if (usersResponse.status === 'fulfilled' && usersResponse.value && usersResponse.value && Array.isArray(usersResponse.value)) {
            totalUsers = usersResponse?.value?.length;
        } else {
            console.log('Users service unavailable, returning 0');
            usersError = true;
        }

        // Handle quizzes count with graceful fallback
        let totalQuizzes = 0;
        let quizzesError = false;
        if (quizzesResponse.status === 'fulfilled' && quizzesResponse.value && quizzesResponse.value && Array.isArray(quizzesResponse.value)) {
            totalQuizzes = quizzesResponse?.value?.length;
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

        const servicesHealthChecks = await Promise.allSettled(
            services.map(service =>
                getFromService(`${service.url}/health`, 200000)
            )
        );

        const servicesHealth = servicesHealthChecks.map((result, index) => ({
            service: services[index].name,
            status: result.status === 'fulfilled' && result.value && result?.value?.status === 'healthy' ? 'healthy' : 'unhealthy',
            database: result.status === 'fulfilled' && result.value && result?.value?.database,
            dbStats: result.status === 'fulfilled' && result.value && result?.value?.dbStats,
            system: result.status === 'fulfilled' && result.value && result?.value?.system,
            process: result.status === 'fulfilled' && result.value && result?.value?.process,
        }));

        let stats = {
            totalUsers,
            totalQuizzes,
            totalDownloads,
            totalScores,
            servicesHealth,
            lastUpdated: new Date().toISOString(),
            errors: {
                usersError,
                quizzesError,
                downloadsError,
                scoresError,
            }
        };

        setCachedData(cacheKey, stats);

        res.status(200).json(stats);
    } catch (err) {
        handleError(res, err);
    }
};

// Real-time statistics update endpoint
exports.updateDashboardStats = async (req, res) => {
    try {
        // Clear dashboard cache to force refresh
        deleteCacheKey('dashboard_stats');

        // Build fresh stats and emit real-time update if socket.io is available
        const stats = await this.getDashboardStats({ query: {} }, { json: (data) => data });

        if (req.io) {
            req.io.emit('dashboard-stats-update', {
                type: 'refresh',
                data: stats
            });
        }

        res.status(200).json(stats);
    } catch (err) {
        handleError(res, err);
    }
};

exports.get50NewUsers = async (req, res) => {

    try {
        const cacheKey = 'new_users_50';
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);


        let users = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users?limit=50`);
        setCachedData(cacheKey, users);
        console.log('Caching users:', users);

        res.status(200).json(users);
    } catch (err) {
        console.log('Unexpected error in get50NewUsers:', err.message);
        throw { 'status': 503, 'message': 'Users temporarily unavailable' };
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const cacheKey = 'all_users';
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);

        let users = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users`);
        setCachedData(cacheKey, users);
        console.log('Caching users:', users);

        res.status(200).json(users);

    } catch (err) {
        console.log('Unexpected error in getAllUsers:', err.message);
        throw { 'status': 503, 'message': 'Users temporarily unavailable' };
    }
};

exports.getUsersWithImage = async (req, res) => {
    try {
        const cacheKey = `users_with_image`;
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);
        let users = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users?filter=image`);
        setCachedData(cacheKey, users);

        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithSchool = async (req, res) => {
    try {
        const cacheKey = `users_with_school`;//`users_with_school_${req.params?.school}`;
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);
        let users = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users?filter=school`);
        if (users) setCachedData(cacheKey, users);

        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithLevel = async (req, res) => {
    try {
        const cacheKey = `users_with_level`;
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);
        let users = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users?filter=level`);
        if (users) setCachedData(cacheKey, users);

        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithFaculty = async (req, res) => {
    try {
        const cacheKey = `users_with_faculty`;
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);
        let users = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users?filter=faculty`);
        if (users) setCachedData(cacheKey, users);

        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithYear = async (req, res) => {
    try {
        const cacheKey = `users_with_year`;
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);
        let users = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users?filter=year`);
        if (users) setCachedData(cacheKey, users);

        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithInterests = async (req, res) => {
    try {
        const cacheKey = `users_with_interests`;
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);
        let users = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users?filter=interests`);
        if (users) setCachedData(cacheKey, users);

        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithAbout = async (req, res) => {
    try {
        const cacheKey = `users_with_about`;
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);
        let users = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users?filter=about`);
        if (users) setCachedData(cacheKey, users);

        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getTop10QuizzingUsers = async (req, res) => {


    try {
        const cacheKey = 'top_10_quizzing_users';
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);
        let quizStats = await getFromService(`${process.env.SCORES_SERVICE_URL}/api/scores/top-10-quizzing-users`);
        if (quizStats) setCachedData(cacheKey, quizStats);

        res.status(200).json(quizStats);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getTop10Quizzes = async (req, res) => {

    try {
        const cacheKey = 'top_10_quizzes';
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);

        let quizStatistics = await getFromService(`${process.env.SCORES_SERVICE_URL}/api/scores/top-10-quizzes`);
        if (quizStatistics) setCachedData(cacheKey, quizStatistics);

        res.status(200).json(quizStatistics);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getTop10Downloaders = async (req, res) => {
    const cacheKey = 'top_10_downloaders';

    try {
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);

        let downloadStats = await getFromService(`${process.env.DOWNLOADS_SERVICE_URL}/api/downloads/top-10-downloaders`, null, req?.header('x-auth-token'));

        setCachedData(cacheKey, downloadStats);

        res.status(200).json(downloadStats);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getTop10Notes = async (req, res) => {
    try {
        const cacheKey = 'top_10_notes';
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);
        let top10 = await getFromService(`${process.env.DOWNLOADS_SERVICE_URL}/api/downloads/top-10-notes`, null, req?.header('x-auth-token'));
        if (top10) setCachedData(cacheKey, top10);

        res.status(200).json(top10);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getDailyUserRegistration = async (req, res) => {

    try {
        const cacheKey = 'daily_user_registration';
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);
        let dailyReg = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/daily-user-registration`);
        if (dailyReg) setCachedData(cacheKey, dailyReg);

        res.status(200).json(dailyReg);
    } catch (err) {
        handleError(res, err);
    }
};

// Real-time analytics endpoint
exports.getLiveAnalytics = async (req, res) => {
    const cacheKey = 'live_analytics';

    try {
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Get today's statistics
        const [todayUsers, todayScores, todayDownloads] = await Promise.allSettled([
            getFromService(`${process.env.USERS_SERVICE_URL}/api/users`, {
                params: { date_from: startOfDay.toISOString() }
            }),
            getFromService(`${process.env.SCORES_SERVICE_URL}/api/scores`, {
                params: { date_from: startOfDay.toISOString() }
            }),
            getFromService(`${process.env.DOWNLOADS_SERVICE_URL}/api/downloads`, {
                params: { date_from: startOfDay.toISOString() }
            })
        ]);

        let analytics = {
            today: {
                newUsers: todayUsers.status === 'fulfilled' ? todayUsers?.value?.length || 0 : 0,
                newScores: todayScores.status === 'fulfilled' ? todayScores?.value?.length || 0 : 0,
                newQuizzes: todayDownloads.status === 'fulfilled' ? todayDownloads?.value?.length || 0 : 0
            },
            timestamp: now.toISOString()
        };

        setCachedData(cacheKey, analytics);

        res.status(200).json(analytics);
    } catch (err) {
        handleError(res, err);
    }
};

// Clear cache endpoint for admin use
exports.clearStatsCache = async (req, res) => {
    try {
        // use helper
        redisCache.clearCache();
        res.status(200).json({ message: 'Statistics cache cleared successfully' });
    } catch (err) {
        handleError(res, err);
    }
};
