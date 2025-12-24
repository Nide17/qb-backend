const UserStore = require('../services/userStore');

module.exports = function connectionHandler(io, socket) {
    if (!socket.user) return;

    // ✅ Check BEFORE adding socket
    const wasOffline = !UserStore.hasUser(socket.user._id);

    // Add socket
    UserStore.add(socket);

    // Emit only on first connection
    if (wasOffline) {
        io.emit("onlineUsers", {
            onlineUsers: UserStore.list(),
            new_user: {
                _id: socket.user._id,
                name: socket.user.name,
                email: socket.user.email,
                role: socket.user.role
            }
        });
    }

    socket.on("disconnect", () => {
        // Remove socket
        UserStore.remove(socket);

        // Check AFTER removal
        const isStillOnline = UserStore.hasUser(socket.user._id);

        // Emit only on last disconnect
        if (!isStillOnline) {
            io.emit("onlineUsers", {
                onlineUsers: UserStore.list(),
                user_offline: {
                    _id: socket.user._id,
                    name: socket.user.name,
                    email: socket.user.email,
                    role: socket.user.role
                }
            });
        }
    });

    socket.on('replySent', (payload) => {
        payload.reply_date = new Date();

        const recipient = UserStore.findByEmail(payload.to_contact);
        if (recipient) {
            for (const socketId of recipient.sockets) {
                const s = io.sockets.sockets.get(socketId);
                if (s) s.emit('replyReceived', payload);
            }
        }

        // Sender always receives their own reply
        socket.emit('replyReceived', payload);
    });

    socket.onAny(() => {
        const u = UserStore.findByUserId(socket.user._id);
        if (u) u.lastActivity = new Date();
    });
};
