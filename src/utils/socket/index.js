const socketIO = require('socket.io');
const authMiddleware = require('./middleware/auth');
const rateLimitMiddleware = require('./middleware/rateLimit');

const connectionHandler = require('./handlers/connection');
const chatHandler = require('./handlers/chat');
const roomsHandler = require('./handlers/rooms');
const quizHandler = require('./handlers/quiz');

const userStore = require('./services/userStore');
const roomStore = require('./services/roomStore');

module.exports = function initSocket(server) {
    const io = socketIO(server, {
        cors: {
            origin: process.env.FRONTEND_URL,
            credentials: true
        },
        transports: ['websocket', 'polling']
    });

    io.userStore = userStore;
    io.roomStore = roomStore;

    // Apply middleware
    io.use(authMiddleware);   // <- rejects unauthenticated sockets
    io.use(rateLimitMiddleware);

    io.on('connection', (socket) => {
        connectionHandler(io, socket);
        chatHandler(io, socket);
        roomsHandler(io, socket);
        quizHandler(io, socket);
    });

    console.log("Socket initialized");
    return io;
};
