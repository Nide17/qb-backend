const os = require('os');

// Memory monitoring configuration
const MEMORY_WARNING_THRESHOLD = 0.7; // 70% of available memory
const MEMORY_CRITICAL_THRESHOLD = 0.85; // 85% of available memory
const CHECK_INTERVAL = 10000; // Check every 10 seconds

// Store memory history for trend analysis
let memoryHistory = [];
const MAX_HISTORY_SIZE = 100;

/**
 * Memory monitoring middleware
 * Monitors memory usage and logs warnings when thresholds are exceeded
 */
const memoryMonitorMiddleware = (req, res, next) => {
    // Only check memory on certain requests to avoid overhead
    if (Math.random() < 0.1) { // Check on 10% of requests
        checkMemoryUsage();
    }
    next();
};

/**
 * Check current memory usage and log warnings if necessary
 */
const checkMemoryUsage = () => {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = usedMemory / totalMemory;

    // Add to history
    memoryHistory.push({
        timestamp: new Date(),
        usedMemory,
        freeMemory,
        memoryUsagePercent
    });

    // Keep history size manageable
    if (memoryHistory.length > MAX_HISTORY_SIZE) {
        memoryHistory = memoryHistory.slice(-MAX_HISTORY_SIZE);
    }

    // // Check thresholds
    // if (memoryUsagePercent >= MEMORY_CRITICAL_THRESHOLD) {
    //     console.error('🚨 CRITICAL MEMORY USAGE DETECTED 🚨');
    //     console.error(`Memory usage: ${(memoryUsagePercent * 100).toFixed(2)}%`);
    //     console.error(`Used: ${(usedMemory / 1024 / 1024).toFixed(2)} MB`);
    //     console.error(`Free: ${(freeMemory / 1024 / 1024).toFixed(2)} MB`);
    //     console.error(`Total: ${(totalMemory / 1024 / 1024).toFixed(2)} MB`);
    //     console.error('Consider implementing pagination or optimizing queries');

    //     // Log request information if available
    //     if (global.currentRequestInfo) {
    //         console.error('Last request info:', global.currentRequestInfo);
    //     }
    // } else if (memoryUsagePercent >= MEMORY_WARNING_THRESHOLD) {
    //     console.warn('⚠️ HIGH MEMORY USAGE WARNING ⚠️');
    //     console.warn(`Memory usage: ${(memoryUsagePercent * 100).toFixed(2)}%`);
    //     console.warn(`Used: ${(usedMemory / 1024 / 1024).toFixed(2)} MB`);
    //     console.warn(`Free: ${(freeMemory / 1024 / 1024).toFixed(2)} MB`);
    // }
};

/**
 * Get memory usage statistics
 */
const getMemoryStats = () => {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = usedMemory / totalMemory;

    return {
        totalMemory: Math.round(totalMemory / 1024 / 1024), // MB
        usedMemory: Math.round(usedMemory / 1024 / 1024),   // MB
        freeMemory: Math.round(freeMemory / 1024 / 1024),   // MB
        memoryUsagePercent: Math.round(memoryUsagePercent * 100 * 100) / 100, // Percentage with 2 decimals
        history: memoryHistory.slice(-10), // Last 10 measurements
        thresholds: {
            warning: MEMORY_WARNING_THRESHOLD * 100,
            critical: MEMORY_CRITICAL_THRESHOLD * 100
        }
    };
};

/**
 * Get memory usage trend analysis
 */
const getMemoryTrend = () => {
    if (memoryHistory.length < 2) {
        return { trend: 'insufficient_data', message: 'Not enough data for trend analysis' };
    }

    const recent = memoryHistory.slice(-5); // Last 5 measurements
    const older = memoryHistory.slice(-10, -5); // Previous 5 measurements

    const recentAvg = recent.reduce((sum, entry) => sum + entry.memoryUsagePercent, 0) / recent.length;
    const olderAvg = older.reduce((sum, entry) => sum + entry.memoryUsagePercent, 0) / older.length;

    const difference = recentAvg - olderAvg;

    if (difference > 0.05) { // 5% increase
        return {
            trend: 'increasing',
            message: 'Memory usage is increasing',
            difference: Math.round(difference * 100 * 100) / 100
        };
    } else if (difference < -0.05) { // 5% decrease
        return {
            trend: 'decreasing',
            message: 'Memory usage is decreasing',
            difference: Math.round(Math.abs(difference) * 100 * 100) / 100
        };
    } else {
        return {
            trend: 'stable',
            message: 'Memory usage is stable',
            difference: Math.round(difference * 100 * 100) / 100
        };
    }
};

/**
 * Start periodic memory monitoring
 */
const startMemoryMonitoring = () => {
    console.log('📊 Starting memory monitoring middleware...');
    setInterval(checkMemoryUsage, CHECK_INTERVAL);

    // Also start the monitoring from error utils
    const { startMemoryMonitoring: startErrorMonitoring } = require('../utils/error');
    startErrorMonitoring();
};

/**
 * Middleware to track request information for memory debugging
 */
const requestTrackerMiddleware = (req, res, next) => {
    // Store request info for memory debugging
    global.currentRequestInfo = {
        method: req.method,
        url: req.url,
        timestamp: new Date().toISOString(),
        userAgent: req.get('User-Agent'),
        ip: req.ip
    };

    // Clear after 30 seconds
    setTimeout(() => {
        if (global.currentRequestInfo &&
            global.currentRequestInfo.timestamp === new Date().toISOString()) {
            delete global.currentRequestInfo;
        }
    }, 30000);

    next();
};

module.exports = {
    memoryMonitorMiddleware,
    requestTrackerMiddleware,
    checkMemoryUsage,
    getMemoryStats,
    getMemoryTrend,
    startMemoryMonitoring
};
