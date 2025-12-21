const jwt = require('jsonwebtoken');

module.exports = function auth(socket, next) {
    try {
        const token = socket.handshake.auth?.token;

        if (!token) {
            // Reject socket completely
            const err = new Error("Authentication error: No token provided");
            err.data = { content: "Please login first" };
            return next(err);
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        socket.user = {
            _id: decoded._id,
            name: decoded.name,
            email: decoded.email,
            role: decoded.role
        };

        next();
    } catch (err) {
        console.log("❌ Socket auth failed:", err.message);
        // Reject socket
        const error = new Error("Authentication error: Invalid token");
        error.data = { content: "Please login again" };
        next(error);
    }
};
