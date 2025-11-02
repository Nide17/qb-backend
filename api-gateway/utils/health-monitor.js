const os = require('os');
const { getFromService } = require('./helpers');

/**
 * Health Monitoring and Metrics Collection
 * Provides comprehensive health checks and performance metrics
 */

class HealthMonitor {
    constructor() {
        this.metrics = {
            requests: 0,
            errors: 0,
            responseTime: [],
            memoryUsage: [],
            cpuUsage: [],
            uptime: Date.now()
        };
        this.healthChecks = new Map();
        this.alerts = [];
        this.thresholds = {
            responseTime: 5000, // 5 seconds
            memoryUsage: 0.9, // 90%
            cpuUsage: 0.8, // 80%
            errorRate: 0.1 // 10%
        };
    }

    /**
     * Record request metrics
     */
    recordRequest(responseTime, isError = false) {
        this.metrics.requests++;
        if (isError) this.metrics.errors++;

        this.metrics.responseTime.push({
            time: responseTime,
            timestamp: Date.now()
        });

        // Keep only last 1000 entries
        if (this.metrics.responseTime.length > 1000) {
            this.metrics.responseTime = this.metrics.responseTime.slice(-1000);
        }

        // Check thresholds
        this.checkThresholds();
    }

    /**
     * Get system metrics
     */
    getSystemMetrics() {
        const memUsage = process.memoryUsage();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        const cpuUsage = process.cpuUsage();
        const loadAvg = os.loadavg();

        const systemMetrics = {
            memory: {
                used: memUsage.heapUsed,
                total: memUsage.heapTotal,
                external: memUsage.external,
                systemUsed: usedMem,
                systemTotal: totalMem,
                systemFree: freeMem,
                usagePercent: (usedMem / totalMem) * 100
            },
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system,
                cores: os.cpus().length
            },
            uptime: {
                process: process.uptime(),
                system: os.uptime()
            },
            platform: {
                type: os.type(),
                platform: os.platform(),
                arch: os.arch(),
                release: os.release()
            }
        };

        // Store metrics for trending
        this.metrics.memoryUsage.push({
            usage: systemMetrics.memory.usagePercent,
            timestamp: Date.now()
        });

        this.metrics.cpuUsage.push({
            usage: loadAvg[0],
            timestamp: Date.now()
        });

        // Keep only last 100 entries
        if (this.metrics.memoryUsage.length > 100) {
            this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-100);
        }
        if (this.metrics.cpuUsage.length > 100) {
            this.metrics.cpuUsage = this.metrics.cpuUsage.slice(-100);
        }

        return systemMetrics;
    }

    /**
     * Check service health
     */
    async checkservicesHealth(serviceName, url) {
        const startTime = Date.now();

        try {
            if (!url || typeof url !== 'string' || url.startsWith('undefined')) {
                const responseTime = Date.now() - startTime;
                const healthStatus = {
                    service: serviceName,
                    status: 'unhealthy',
                    responseTime,
                    timestamp: Date.now(),
                    details: null,
                    error: 'Service URL not configured'
                };

                this.healthChecks.set(serviceName, healthStatus);
                return healthStatus;
            }

            const response = await getFromService(`${url}/health`);

            const responseTime = Date.now() - startTime;

            // getFromService returns either an object or null; handle both
            const isHealthy = response && (response.status === 200 || response.status === 'healthy' || response.status === 'ok');

            const healthStatus = {
                service: serviceName,
                status: isHealthy ? 'healthy' : 'degraded',
                responseTime,
                timestamp: Date.now(),
                details: response || null,
                error: response ? null : 'No response or invalid health payload'
            };

            this.healthChecks.set(serviceName, healthStatus);
            return healthStatus;

        } catch (error) {
            const responseTime = Date.now() - startTime;
            const healthStatus = {
                service: serviceName,
                status: 'unhealthy',
                responseTime,
                timestamp: Date.now(),
                details: null,
                error: error.message
            };

            this.healthChecks.set(serviceName, healthStatus);
            return healthStatus;
        }
    }

    // Database health checks have been removed from the gateway.
    // The HealthMonitor remains focused on service checks and system metrics.

    /**
     * Get comprehensive health report
     */
    async getHealthReport(services = []) {
        const systemMetrics = this.getSystemMetrics();
        const serviceChecks = [];

        // Check all registered services
        for (const [name, url] of Object.entries(services)) {
            const health = await this.checkservicesHealth(name, url);
            serviceChecks.push(health);
        }

        // Calculate overall status
        const unhealthyServices = serviceChecks.filter(s => s.status === 'unhealthy').length;
        const degradedServices = serviceChecks.filter(s => s.status === 'degraded').length;

        let overallStatus = 'healthy';
        if (unhealthyServices > 0) {
            overallStatus = 'unhealthy';
        } else if (degradedServices > 0) {
            overallStatus = 'degraded';
        }

        return {
            status: overallStatus,
            timestamp: Date.now(),
            uptime: Date.now() - this.metrics.uptime,
            system: systemMetrics,
            services: serviceChecks,
            metrics: this.getMetricsSummary(),
            alerts: this.alerts.slice(-10) // Last 10 alerts
        };
    }

    /**
     * Get metrics summary
     */
    getMetricsSummary() {
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);

        // Filter recent metrics
        const recentResponseTimes = this.metrics.responseTime.filter(r => r.timestamp > oneHourAgo);
        const recentMemory = this.metrics.memoryUsage.filter(m => m.timestamp > oneHourAgo);
        const recentCpu = this.metrics.cpuUsage.filter(c => c.timestamp > oneHourAgo);

        const avgResponseTime = recentResponseTimes.length > 0
            ? recentResponseTimes.reduce((sum, r) => sum + r.time, 0) / recentResponseTimes.length
            : 0;

        const avgMemoryUsage = recentMemory.length > 0
            ? recentMemory.reduce((sum, m) => sum + m.usage, 0) / recentMemory.length
            : 0;

        const avgCpuUsage = recentCpu.length > 0
            ? recentCpu.reduce((sum, c) => sum + c.usage, 0) / recentCpu.length
            : 0;

        const errorRate = this.metrics.requests > 0 ? this.metrics.errors / this.metrics.requests : 0;

        return {
            totalRequests: this.metrics.requests,
            totalErrors: this.metrics.errors,
            errorRate,
            averageResponseTime: Math.round(avgResponseTime),
            averageMemoryUsage: Math.round(avgMemoryUsage * 100) / 100,
            averageCpuUsage: Math.round(avgCpuUsage * 100) / 100,
            period: 'last 1 hour'
        };
    }

    /**
     * Check thresholds and create alerts
     */
    checkThresholds() {
        const metrics = this.getMetricsSummary();
        const alerts = [];

        if (metrics.averageResponseTime > this.thresholds.responseTime) {
            alerts.push({
                type: 'warning',
                message: `High response time: ${metrics.averageResponseTime}ms`,
                threshold: this.thresholds.responseTime,
                timestamp: Date.now()
            });
        }

        if (metrics.averageMemoryUsage > this.thresholds.memoryUsage * 100) {
            alerts.push({
                type: 'critical',
                message: `High memory usage: ${metrics.averageMemoryUsage}%`,
                threshold: this.thresholds.memoryUsage * 100,
                timestamp: Date.now()
            });
        }

        if (metrics.averageCpuUsage > this.thresholds.cpuUsage) {
            alerts.push({
                type: 'warning',
                message: `High CPU usage: ${metrics.averageCpuUsage}`,
                threshold: this.thresholds.cpuUsage,
                timestamp: Date.now()
            });
        }

        if (metrics.errorRate > this.thresholds.errorRate) {
            alerts.push({
                type: 'critical',
                message: `High error rate: ${(metrics.errorRate * 100).toFixed(2)}%`,
                threshold: this.thresholds.errorRate * 100,
                timestamp: Date.now()
            });
        }

        // Add new alerts
        this.alerts.push(...alerts);

        // Keep only last 100 alerts
        if (this.alerts.length > 100) {
            this.alerts = this.alerts.slice(-100);
        }

        return alerts;
    }

    /**
     * Express middleware for automatic metrics collection
     */
    middleware() {
        return (req, res, next) => {
            const startTime = Date.now();

            // Override res.end to capture response time
            const originalEnd = res.end;
            res.end = (...args) => {
                const responseTime = Date.now() - startTime;
                const isError = res.status >= 400;
                this.recordRequest(responseTime, isError);
                originalEnd.apply(res, args);
            };

            next();
        };
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            requests: 0,
            errors: 0,
            responseTime: [],
            memoryUsage: [],
            cpuUsage: [],
            uptime: Date.now()
        };
        this.alerts = [];
    }
}

module.exports = HealthMonitor;
