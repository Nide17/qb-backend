const rooms = new Map();

module.exports = {
    addUserToRoom(room, socketId) {
        if (!rooms.has(room)) {
            rooms.set(room, { members: new Set(), lastActivity: new Date() });
        }
        const rm = rooms.get(room);
        rm.members.add(socketId);
        rm.lastActivity = new Date();
    },

    removeUserFromRoom(room, socketId) {
        if (!rooms.has(room)) return;

        const rm = rooms.get(room);
        rm.members.delete(socketId);

        if (rm.members.size === 0) {
            rooms.delete(room);
        }
    },

    getRoom(room) {
        return rooms.get(room);
    }
};
