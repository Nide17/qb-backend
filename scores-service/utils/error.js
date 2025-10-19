const os = require('os');

const handleError = (res, err, status) => {
    console.error('Error occurred:', err?.name, err?.message);

    // Handle MongoDB Cast Errors
    if (err.name === 'CastError') {
        if (err.kind === 'ObjectId') {
            return res.status(400).json({
                success: false,
                message: 'Invalid ID format provided',
                code: 'INVALID_ID_FORMAT',
                error: 'The provided ID is not a valid MongoDB ObjectId',
                timestamp: new Date().toISOString()
            });
        }
        return res.status(400).json({
            success: false,
            message: `Invalid ${err.path} format`,
            code: 'CAST_ERROR',
            error: err.message,
            timestamp: new Date().toISOString()
        });
    }

    // Handle MongoDB Validation Errors
    else if (err.name === 'ValidationError') {
        const validationErrors = Object.values(err.errors).map(e => ({
            field: e.path,
            message: e.message,
            value: e.value
        }));
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            errors: validationErrors,
            timestamp: new Date().toISOString()
        });
    }

    // Handle MongoDB Duplicate Key Error
    else if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        return res.status(409).json({
            success: false,
            message: `${field} already exists`,
            code: 'DUPLICATE_KEY',
            error: `A record with this ${field} already exists`,
            timestamp: new Date().toISOString()
        });
    }

    // Handle JWT Errors
    else if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token',
            code: 'INVALID_TOKEN',
            timestamp: new Date().toISOString()
        });
    }

    else if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'You need to login again!',
            code: 'TOKEN_EXPIRED',
            timestamp: new Date().toISOString()
        });
    }

    // Handle Axios Errors
    else if (err.isAxiosError) {
        if (err.response) {
            return res.status(err.response.status).json({
                success: false,
                message: err.response.data?.message || err.response.data?.msg || err.message,
                code: `HTTP_${err.response.status}`,
                timestamp: new Date().toISOString()
            });
        } else if (err.request) {
            return res.status(503).json({
                success: false,
                message: `Feedbacks Service Unavailable`,
                code: 'SERVICE_UNAVAILABLE',
                timestamp: new Date().toISOString()
            });
        }
    }

    // Handle 404 errors
    else if (err.code === 'ENOTFOUND') {
        return res.status(404).json({
            success: false,
            message: `Route ${req.originalUrl} does not exist`,
            code: 'NOT_FOUND',
            timestamp: new Date().toISOString()
        });
    }

    // Default error response
    const statusCode = status || err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal server error',
        code: err.code || 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
    });
}

// Memory monitoring configuration
const MEMORY_WARNING_THRESHOLD = 0.8; // 80% of available memory
const MEMORY_CRITICAL_THRESHOLD = 0.9; // 90% of available memory

// Monitor memory usage and log warnings
const monitorMemoryUsage = () => {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = usedMemory / totalMemory;

    // if (memoryUsagePercent >= MEMORY_CRITICAL_THRESHOLD) {
    //     console.error('🚨 CRITICAL MEMORY USAGE 🚨');
    //     console.error(`Memory usage: ${(memoryUsagePercent * 100).toFixed(2)}%`);
    //     console.error(`Used: ${(usedMemory / 1024 / 1024).toFixed(2)} MB`);
    //     console.error(`Free: ${(freeMemory / 1024 / 1024).toFixed(2)} MB`);
    //     console.error('Consider implementing pagination or optimizing queries');
    // } else if (memoryUsagePercent >= MEMORY_WARNING_THRESHOLD) {
    //     console.warn('⚠️ HIGH MEMORY USAGE WARNING ⚠️');
    //     console.warn(`Memory usage: ${(memoryUsagePercent * 100).toFixed(2)}%`);
    //     console.warn(`Used: ${(usedMemory / 1024 / 1024).toFixed(2)} MB`);
    //     console.warn(`Free: ${(freeMemory / 1024 / 1024).toFixed(2)} MB`);
    // }

    return {
        totalMemory,
        usedMemory,
        freeMemory,
        memoryUsagePercent
    };
};

// Start memory monitoring interval (every 30 seconds)
const startMemoryMonitoring = () => {
    console.log('📊 Starting memory monitoring...');
    setInterval(monitorMemoryUsage, 30000); // 30 seconds
};

// Get current memory stats
const getMemoryStats = () => {
    return monitorMemoryUsage();
};

module.exports = {
    handleError,
    monitorMemoryUsage,
    startMemoryMonitoring,
    getMemoryStats
};
