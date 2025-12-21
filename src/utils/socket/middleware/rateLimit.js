module.exports = function rateLimit(socket, next) {
    const now = Date.now();

    if (!socket.rate) {
        socket.rate = { hits: [], lastReset: now };
    }

    if (now - socket.rate.lastReset > 60000) {
        socket.rate.hits = [];
        socket.rate.lastReset = now;
    }

    if (socket.rate.hits.length > 100) {
        return next(new Error("Rate limit exceeded"));
    }

    socket.rate.hits.push(now);

    next();
};
