const os = require('os');
const process = require('process');
const { handleError } = require('../../../utils/error');
const { getEventLoopLag, getCpuUsagePercent } = require('../helpers');
const { cacheManager, cacheWrapper } = require('../../../utils/global-helpers');
const { getDB } = require('../../../utils/db-manager');

const { getBatchedUsersMap } = require('../../users/helpers');
const { getBatchedQuizzesMap } = require('../../quizzing/helpers');
const { getBatchedNotesMap } = require('../../courses/helpers');

const { getModels } = require('../../../utils/db-manager');
const UserModel = require('../../users/models/User');
const QuizModel = require('../../quizzing/models/Quiz');
const DownloadModel = require('../../downloads/models/Download');
const ScoreModel = require('../../scores/models/Score');

const CACHE_TTL = 300; // 5 minutes
const CACHE_KEYS = {
    SUMMARY_STATS: "st:summary-stats",
    SYSTEM_METRICS: "st:system-metrics",
    DATA_METRICS: "st:data-metrics",
    USERS_STATS: (key) => `st:users:${key}`,
    QUIZZES_STATS: (key) => `st:quizzes:${key}`,
    DOWNLOADS_STATS: (key) => `st:downloads:${key}`,
    NOTES_STATS: (key) => `st:notes:${key}`,
    LIVE: "st:liveAnalytics"
};

// ===================================================================
// SYSTEM METRICS CONTROLLER
// ===================================================================
exports.getSystemMetrics = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.SYSTEM_METRICS;

        const data = await cacheWrapper.wrap(cacheKey, 60, async () => {

            const cpuUsagePercentage = await getCpuUsagePercent();
            const eventLoopLagMs = await getEventLoopLag();

            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const memoryUsagePercent = Number((((totalMem - freeMem) / totalMem) * 100).toFixed(2));

            return {
                status: "success",
                system: {
                    os: os.type(),
                    platform: os.platform(),
                    architecture: os.arch(),
                    cpuCount: os.cpus().length,
                    cpuUsagePercentage,
                    totalMemory: totalMem,
                    freeMemory: freeMem,
                    memoryUsagePercent,
                    uptimeSeconds: os.uptime(),
                    eventLoopLagMs,
                    timestamp: new Date().toISOString()
                },
                process: {
                    pid: process.pid,
                    uptimeSeconds: process.uptime(),
                    memoryUsage: process.memoryUsage(),
                    cpuUsage: process.cpuUsage(),
                    execPath: process.execPath,
                    nodeVersion: process.version,
                },
                summary: {
                    cpuOK: cpuUsagePercentage < 85,
                    memoryOK: memoryUsagePercent < 90,
                    eventLoopOK: eventLoopLagMs < 100,
                    healthy: cpuUsagePercentage < 85 && memoryUsagePercent < 90 && eventLoopLagMs < 100
                }
            };
        });

        res.status(200).json(data);

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ===================================================================
// DATA METRICS CONTROLLER (DB + REDIS ONLY)
// ===================================================================
exports.getDataMetrics = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.DATA_METRICS;

        const data = await cacheWrapper.wrap(cacheKey, 60, async () => {

            // ------------------------------------------------------------
            // DATABASE LIST
            // ------------------------------------------------------------
            const DATABASES = [
                { key: "users", uri: process.env.USERS_URI },
                { key: "quizzing", uri: process.env.QUIZZING_URI },
                { key: "posts", uri: process.env.POSTS_URI },
                { key: "schools", uri: process.env.SCHOOLS_URI },
                { key: "courses", uri: process.env.COURSES_URI },
                { key: "scores", uri: process.env.SCORES_URI },
                { key: "downloads", uri: process.env.DOWNLOADS_URI },
                { key: "contacts", uri: process.env.CONTACTS_URI },
                { key: "feedbacks", uri: process.env.FEEDBACKS_URI },
                { key: "comments", uri: process.env.COMMENTS_URI }
            ];

            // ------------------------------------------------------------
            // Collect DB Metrics with latency
            // ------------------------------------------------------------
            const dbMetrics = {};

            for (const cfg of DATABASES) {
                const db = await getDB(cfg.key, cfg.uri);
                const isConnected = db?.readyState === 1;

                let stats = null;
                let latency = null;

                if (isConnected) {
                    try {
                        const start = Date.now();

                        // FIX: correct Mongo stats command
                        stats = await db.db.command({ dbStats: 1 });

                        latency = Date.now() - start;
                    } catch (err) {
                        console.error(`DB Stats error for ${cfg.key}:`, err.message);
                        latency = null;
                    }
                }

                dbMetrics[cfg.key] = {
                    connected: isConnected,
                    latencyMs: latency,
                    name: db?.name || cfg.key,
                    stats: stats && {
                        collections: stats.collections,
                        objects: stats.objects,
                        dataSize: stats.dataSize,
                        storageSize: stats.storageSize,
                        indexSize: stats.indexSize,
                    }
                };
            }

            // ------------------------------------------------------------
            // REDIS METRICS
            // ------------------------------------------------------------
            let redis = {
                connected: cacheManager.isReady(),
                latencyMs: null,
                keyCount: null,
                memoryUsed: null,
                memoryPeak: null,
                hitRate: null,
                missRate: null,
                rawInfo: null
            };

            if (cacheManager.isReady()) {
                try {
                    const start = Date.now();
                    await cacheManager.redis.ping();
                    const latency = Date.now() - start;

                    const stats = await cacheManager.getStats();

                    redis = {
                        connected: true,
                        latencyMs: latency,
                        keyCount: stats?.keyCount || 0,
                        memoryUsed: Number(stats.info?.used_memory || 0),
                        memoryPeak: Number(stats.info?.used_memory_peak || 0),
                        hitRate: stats.info?.keyspace_hits || 0,
                        missRate: stats.info?.keyspace_misses || 0,
                        rawInfo: stats?.info || {}
                    };

                } catch {
                    redis.connected = false;
                }
            }

            // ------------------------------------------------------------
            // GLOBAL SUMMARY
            // ------------------------------------------------------------
            const totalDbs = Object.keys(dbMetrics).length;
            const connectedDbs = Object.values(dbMetrics).filter(d => d.connected).length;

            return {
                status: connectedDbs === totalDbs && redis.connected ? "healthy" : "degraded",
                databases: dbMetrics,
                redis,
                summary: {
                    databasesHealthy: connectedDbs === totalDbs,
                    redisHealthy: redis.connected,
                    healthy: connectedDbs === totalDbs && redis.connected
                },
                timestamp: new Date().toISOString()
            };
        });

        res.status(200).json(data);

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};


// Aggregated dashboard statistics endpoint
exports.getSummaryStats = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.SUMMARY_STATS;
        const { User } = await getModels('users');
        const { Quiz } = await getModels('quizzing');
        const { Download } = await getModels('downloads');
        const { Score } = await getModels('scores');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            // Get actual data from working endpoints and count them through API Gateway
            const [usersResponse, quizzesResponse, downloadsResponse, scoresResponse] = await Promise.allSettled([
                User.countDocuments({}).lean(),
                Quiz.countDocuments({}).lean(),
                Download.countDocuments({}).lean(),
                Score.countDocuments({}).lean(),
            ]);

            // Handle users count with graceful fallback
            let totalUsers = 0;
            let usersError = false;
            if (usersResponse.status === 'fulfilled' && usersResponse.value && usersResponse.value) {
                totalUsers = usersResponse?.value;
            } else {
                console.log('Users unavailable, returning 0');
                usersError = true;
            }

            // Handle quizzes count with graceful fallback
            let totalQuizzes = 0;
            let quizzesError = false;
            if (quizzesResponse.status === 'fulfilled' && quizzesResponse.value && quizzesResponse.value) {
                totalQuizzes = quizzesResponse?.value;
            } else {
                console.log('Quizzes unavailable, returning 0');
                quizzesError = true;
            }

            // Handle downloads count with graceful fallback
            let totalDownloads = 0;
            let downloadsError = false;
            if (downloadsResponse.status === 'fulfilled' && downloadsResponse.value && downloadsResponse.value) {
                totalDownloads = downloadsResponse.value;
            } else {
                console.log('Downloads unavailable, returning 0\n');
                downloadsError = true;
            }

            // Handle scores count with graceful fallback
            let totalScores = 0;
            let scoresError = false;
            if (scoresResponse.status === 'fulfilled' && scoresResponse.value && scoresResponse.value) {
                totalScores = scoresResponse.value;
            } else {
                console.log('Scores unavailable, returning 0');
                scoresError = true;
            }

            let stats = {
                totalUsers,
                totalQuizzes,
                totalDownloads,
                totalScores,
                lastUpdated: new Date().toISOString(),
                errors: {
                    usersError,
                    quizzesError,
                    downloadsError,
                    scoresError,
                }
            };

            return stats;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

// Real-time statistics update endpoint
exports.updateSummaryStats = async (req, res) => {
    try {
        // Clear dashboard cache to force refresh
        await cacheManager.del(CACHE_KEYS.SUMMARY_STATS);

        // Build fresh stats and emit real-time update if socket.io is available
        const stats = await this.getSummaryStats({ query: {} }, { json: (data) => data });

        if (req.io) {
            req.io.emit('summary-stats-update', {
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
        const cacheKey = CACHE_KEYS.USERS_STATS('new50');
        const { User } = await getModels('users');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await User.find({}).sort({ register_date: -1 }).limit(50).lean();
        });
        res.status(200).json(data);
    } catch (err) {
        console.log('Unexpected error in get50NewUsers:', err.message);
        throw { 'status': 503, 'message': 'Users temporarily unavailable' };
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const cacheKey = 'usr:all';
        const { User } = await getModels('users');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await User.find({}).lean();
        });
        res.status(200).json(data);
    } catch (err) {
        console.log('Unexpected error in getAllUsers:', err.message);
        throw { 'status': 503, 'message': 'Users temporarily unavailable' };
    }
};

exports.getUsersWithImage = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.USERS_STATS('image');
        const { User } = await getModels('users');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await User.find({ image: { $exists: true, $ne: '' } }).lean();
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithSchool = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.USERS_STATS('school');
        const { User } = await getModels('users');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await User.find({ school: { $exists: true, $ne: null } }).lean();
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithLevel = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.USERS_STATS('level');
        const { User } = await getModels('users');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await User.find({ level: { $exists: true, $ne: null } }).lean();
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithFaculty = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.USERS_STATS('faculty');
        const { User } = await getModels('users');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await User.find({ faculty: { $exists: true, $ne: null } }).lean();
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithYear = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.USERS_STATS('year');
        const { User } = await getModels('users');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await User.find({ year: { $exists: true, $ne: null } }).lean();
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithInterests = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.USERS_STATS('interests');
        const { User } = await getModels('users');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await User.find({ interests: { $exists: true, $ne: [] } }).lean();
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getUsersWithAbout = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.USERS_STATS('about');
        const { User } = await getModels('users');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await User.find({ about: { $exists: true, $ne: '' } }).lean();
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getTop10QuizzingUsers = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.USERS_STATS('top10quizzing');
        const { Score } = await getModels('scores');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            let topUsers = await Score.aggregate([
                { $group: { _id: '$taken_by', totalQuizzes: { $sum: 1 }, avgMarks: { $avg: '$marks' } } },
                { $sort: { totalQuizzes: -1 } },
                { $limit: 10 }
            ]).exec();

            if (topUsers.length > 0) {
                const usersIDs = topUsers.map(u => u._id.toString());
                const usersMap = await getBatchedUsersMap(usersIDs);
                topUsers = topUsers.map(usr => usersMap?.get(usr?._id.toString()) || {});
            }

            return topUsers;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getTop10Quizzes = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.QUIZZES_STATS('top10');
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            // Get top quizzes
            let topQuizzes = [];

            const { Score } = await getModels('scores');

            const topQuizzesData = await Score.aggregate([
                { $group: { _id: '$quiz', totalTaken: { $sum: 1 } } },
                { $sort: { totalTaken: -1 } },
                { $limit: 10 }
            ]).exec();

            if (topQuizzesData.length > 0) {
                const quizzesIDs = topQuizzesData.map(q => q._id.toString());
                const quizzesMap = await getBatchedQuizzesMap(quizzesIDs);
                topQuizzes = topQuizzesData.map(qz => quizzesMap?.get(qz?._id.toString()) || {});
            }

            return topQuizzes;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getTop10Downloaders = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.DOWNLOADS_STATS('top10');
        const { Download } = await getModels('downloads');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            // Get top downloaders aggregation
            let topDownloaders = await Download.aggregate([
                { $group: { _id: '$downloaded_by', totalDownloads: { $sum: 1 } } },
                { $sort: { totalDownloads: -1 } },
                { $limit: 10 }
            ]).exec();

            if (topDownloaders.length > 0) {

                const usersIDs = topDownloaders.map(u => u?._id?.toString());
                const usersMap = await getBatchedUsersMap(usersIDs);

                topDownloaders = topDownloaders.map(usr => {
                    const user = usersMap.get(usr._id.toString()) || {};
                    return {
                        _id: usr._id,
                        name: user?.name || 'Unknown User',
                        email: user?.email || '',
                        totalDownloads: usr.totalDownloads
                    };
                });
            }

            return topDownloaders;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getTop10Notes = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.NOTES_STATS('top10');
        const { Download } = await getModels('downloads');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            // Get top notes aggregation
            const topNotesData = await Download.aggregate([
                { $group: { _id: '$notes', totalDownloaded: { $sum: 1 } } },
                { $sort: { totalDownloaded: -1 } },
                { $limit: 10 }
            ]).exec();


            let topNotes = [];

            if (topNotesData.length > 0) {
                const notesIDs = topNotesData.map(note => note?._id?.toString());
                const notesMap = await getBatchedNotesMap(notesIDs);

                topNotes = topNotesData.map(nt => {
                    const note = notesMap?.get(nt._id.toString()) || {};
                    return {
                        _id: nt._id,
                        title: note.title || 'Unknown Note',
                        courseCategory: note.courseCategory || 'Uncategorized',
                        slug: note.slug || '',
                        totalDownloaded: nt.totalDownloaded
                    };
                });
            }

            return topNotes;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getDailyUserRegistration = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.USERS_STATS('dailyRegistration');
        const { User } = await getModels('users');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const usersStats = await User.aggregate([
                {
                    $project: {
                        register_date_CAT: {
                            $dateToString: {
                                format: '%Y-%m-%d',
                                date: { $add: ['$register_date', 2 * 60 * 60 * 1000] }
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: '$register_date_CAT',
                        users: { $sum: 1 }
                    }
                },
                {
                    $sort: { _id: 1 }
                },
                {
                    $project: {
                        _id: 0,
                        date: '$_id',
                        users: 1
                    }
                }
            ]).exec();

            return usersStats;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

// Real-time analytics endpoint
exports.getLiveAnalytics = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.LIVE
        const { User } = await getModels('users');
        const { Download } = await getModels('downloads');
        const { Score } = await getModels('scores');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            // Get today's statistics
            const [todayUsers, todayScores, todayDownloads] = await Promise.allSettled([
                User.find({ register_date: { $gte: startOfDay } }).lean(),
                Score.find({ test_date: { $gte: startOfDay } }).lean(),
                Download.find({ createdAt: { $gte: startOfDay } }).lean()
            ]);

            let analytics = {
                today: {
                    newUsers: todayUsers.status === 'fulfilled' ? todayUsers?.value?.length || 0 : 0,
                    newScores: todayScores.status === 'fulfilled' ? todayScores?.value?.length || 0 : 0,
                    newQuizzes: todayDownloads.status === 'fulfilled' ? todayDownloads?.value?.length || 0 : 0
                },
                timestamp: now.toISOString()
            };

            return analytics;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};
