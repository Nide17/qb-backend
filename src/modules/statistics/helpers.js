const { performance } = require("perf_hooks");
const os = require('os');

async function getEventLoopLag() {
    
    return new Promise(resolve => {
        const start = performance.now();
        setImmediate(() => {
            resolve(Number((performance.now() - start).toFixed(2)));
        });
    });
}

function getCpuAverage() {
    const cpus = os.cpus();
    let idle = 0, total = 0;

    cpus.forEach(cpu => {
        for (let type in cpu.times) total += cpu.times[type];
        idle += cpu.times.idle;
    });

    return {
        idle: idle / cpus.length,
        total: total / cpus.length
    };
}

async function getCpuUsagePercent() {
    const start = getCpuAverage();
    return new Promise(resolve => {
        setTimeout(() => {
            const end = getCpuAverage();
            const idle = end.idle - start.idle;
            const total = end.total - start.total;
            const usage = total > 0 ? (1 - idle / total) * 100 : 0;
            resolve(Number(usage.toFixed(2)));
        }, 100);
    });
}
module.exports = { getEventLoopLag, getCpuUsagePercent, };
