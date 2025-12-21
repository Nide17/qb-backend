const UserStore = require('../services/userStore');

module.exports = function chatHandler(io, socket) {

    // Private message
    socket.on("privateMessage", ({ recipient, message }) => {
        const target = UserStore.findByUserId(recipient);
        if (!target) return socket.emit("messageError", "User offline");

        io.to(target.socketId).emit("privateMessage", {
            sender: socket.user?._id,
            message,
            timestamp: new Date()
        });
    });

    // Typing in private chat
    socket.on('typing', ({ roomID, user }) => {
        if (!roomID) return;
        socket.to(roomID).emit('userTyping', { user });
    });

    socket.on('stopTyping', ({ roomID, user }) => {
        if (!roomID) return;
        socket.to(roomID).emit('userStoppedTyping', { user });
    });
};
