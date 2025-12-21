const onlineUsers = new Map();

module.exports = {
    add(socket) {
        onlineUsers.set(socket.id, {
            socketId: socket.id,
            _id: socket.user?._id,
            name: socket.user?.name,
            email: socket.user?.email,
            role: socket.user?.role,
            lastActivity: new Date()
        });
    },

    remove(socket) {
        onlineUsers.delete(socket.id);
    },

    list() {
        return Array.from(onlineUsers.values());
    },

    findByUserId(_id) {
        for (const u of onlineUsers.values()) {
            if (u._id === _id) return u;
        }
        return null;
    },

    findByEmail(email) {
        for (const u of onlineUsers.values()) {
            if (u.email === email) return u;
        }
        return null;
    }
};
