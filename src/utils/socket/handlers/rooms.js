const RoomStore = require('../services/roomStore');

module.exports = function roomsHandler(io, socket) {

    // Join room
    socket.on("joinRoom", (roomID) => {
        socket.join(roomID);
        RoomStore.addUserToRoom(roomID, socket.id);

        socket.to(roomID).emit("userJoinedRoom", {
            _id: socket.user?._id,
            name: socket.user?.name,
        });
    });

    // Leave room
    socket.on("leaveRoom", (roomID) => {
        socket.leave(roomID);
        RoomStore.removeUserFromRoom(roomID, socket.id);
    });

    // Send room message
    socket.on("roomMessage", (roomMessage) => {

        const { roomID } = roomMessage;

        if (!roomID) return;
        io.to(roomID).emit("newMessage", roomMessage);
    });

    // Typing in room
    socket.on('typing', ({ roomID, user }) => {
        if (!roomID) return;
        socket.to(roomID).emit('userTyping', { user });
    });

    socket.on('stopTyping', ({ roomID, user }) => {
        if (!roomID) return;
        socket.to(roomID).emit('userStoppedTyping', { user });
    });
};
