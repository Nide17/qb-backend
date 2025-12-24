const users = new Map(); // userId -> { user, sockets: Set, lastActivity }

module.exports = {
    add(socket) {
        const userId = socket.user._id;

        if (!users.has(userId)) {
            users.set(userId, {
                _id: userId,
                name: socket.user.name,
                email: socket.user.email,
                role: socket.user.role,
                sockets: new Set(),
                lastActivity: new Date()
            });
        }

        users.get(userId).sockets.add(socket.id);
    },

    remove(socket) {
        const userId = socket.user._id;
        const user = users.get(userId);
        if (!user) return;

        user.sockets.delete(socket.id);

        if (user.sockets.size === 0) {
            users.delete(userId);
        }
    },

    hasUser(userId) {
        return users.has(userId);
    },

    list() {
        return Array.from(users.values()).map(u => ({
            _id: u._id,
            name: u.name,
            email: u.email,
            role: u.role,
            socketCount: u.sockets.size,
            lastActivity: u.lastActivity
        }));
    },

    findByUserId(userId) {
        return users.get(userId) || null;
    },

    findByEmail(email) {
        for (const u of users.values()) {
            if (u.email === email) return u;
        }
        return null;
    }
};
