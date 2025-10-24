// Enhanced Socket.IO for Contacts Service
// Uses the shared enhanced socket manager for improved real-time features
const socketManager = require('../../shared-utils/enhanced-socket');

let io = null;

exports.initialize = (httpServer) => {
    // Initialize with the enhanced socket manager
    io = socketManager.initialize(httpServer);

    console.log('✨ Contacts Service: Enhanced Socket.IO initialized');
    
    // Set up contacts-specific event handlers
    setupContactsEvents();
    
    return io;
};

function setupContactsEvents() {
    // Listen for new replies on contacts
    socketManager.getIO().on('connection', (socket) => {
        // Handle new replies to contact messages
        socket.on('newReply', (data) => {
            data.reply_date = new Date();
            socketManager.broadcastToAll('replyReceived', data);
        });

        // Handle contact messages from client
        socket.on('contactMsgClient', (contactMsg) => {
            socket.broadcast.emit('contactMsgServer', contactMsg);
        });

        // Legacy room joining (kept for backward compatibility)
        socket.on('join_room', ({ username, roomName }) => {
            console.log(`${username} joined room: ${roomName}`);
            socket.join(roomName);

            socket.to(roomName).emit('welcome_room_message', {
                message: `${username} has joined the chat room`,
                username
            });

            socket.emit('welcome_room_message', {
                message: `Welcome ${username}`,
                username
            });

            // Room messages (legacy support)
            socket.on('room_message', (data) => {
                socketManager.getIO().in(roomName).emit('backRoomMessage', data);
            });
        });
    });
}

// Export functions for compatibility with existing code
exports.getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};

// Enhanced methods using the new socket manager
exports.getOnlineUsers = () => socketManager.getOnlineUsers();
exports.getOnlineUserCount = () => socketManager.getOnlineUserCount();
exports.getOnlineUserById = (userId) => socketManager.getUserById(userId);
exports.sendToUser = (userId, event, data) => socketManager.sendToUser(userId, event, data);
exports.broadcastToRoom = (roomId, event, data) => socketManager.broadcastToRoom(roomId, event, data);
exports.broadcastToAll = (event, data) => socketManager.broadcastToAll(event, data);

// Backward compatibility methods (deprecated)
exports.addOnlineUser = (_user) => {
    console.warn('addOnlineUser is deprecated - users are managed automatically');
};

exports.removeOnlineUser = (_socketID) => {
    console.warn('removeOnlineUser is deprecated - users are managed automatically');
};

exports.getOnlineUser = (_socketID) => {
    console.warn('getOnlineUser is deprecated - use getOnlineUserById instead');
    const users = socketManager.getOnlineUsers();
    return users.find(user => user.socketId === _socketID);
};

exports.getOnlineUserByEmail = (email) => {
    const users = socketManager.getOnlineUsers();
    return users.find(user => user.email === email);
};