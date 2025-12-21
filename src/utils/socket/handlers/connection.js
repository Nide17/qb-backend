const UserStore = require('../services/userStore');

module.exports = function connectionHandler(io, socket) {
    // Only log if socket passed authentication
    if (!socket.user) return;

    // Add authenticated user to stores
    UserStore.add(socket);
    io.userStore.add(socket);
    io.emit("onlineUsers", {
        onlineUsers: UserStore.list(),
        new_user: {
            userId: socket.user?._id,
            name: socket.user?.name,
            email: socket.user?.email,
            role: socket.user?.role
        }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
        UserStore.remove(socket);
        io.userStore.remove(socket);

        // TODO: remove from room store if needed
        io.emit("onlineUsers", {
            onlineUsers: UserStore.list(),
            new_user: {
                userId: socket.user?._id,
                name: socket.user?.name,
                email: socket.user?.email,
                role: socket.user?.role
            }
        });
    });

    socket.on('replySent', (payload) => {
        payload.reply_date = new Date();

        const recipient = UserStore.findByEmail(payload.to_contact);
        if (recipient) {
            const recipientSocket = io.sockets.sockets.get(recipient.socketId);
            if (recipientSocket) recipientSocket.emit('replyReceived', payload);
        }

        // sender always gets their own reply
        socket.emit('replyReceived', payload);
    });

    // Update last activity on any event
    socket.onAny(() => {
        const u = UserStore.findByUserId(socket.user?._id);
        if (u) u.lastActivity = new Date();
    });
};
