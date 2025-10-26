// Enhanced Socket.IO Configuration and Management for API Gateway
// This file provides improved real-time communication features

const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');

class SocketManager {
    constructor() {
        this.io = null;
        this.onlineUsers = new Map();
        this.userRooms = new Map();
        this.quizSessions = new Map();
        this.chatRooms = new Map();
        this.connectionStats = {
            totalConnections: 0,
            currentConnections: 0,
            peakConnections: 0,
            lastPeak: null
        };
    }

    initialize(httpServer) {
        const corsOptions = {
            origin: [
                'http://localhost:3000',
                'http://localhost:5173',
                'http://localhost:8080',
                'https://quizblog.rw',
                'https://www.quizblog.rw',
                process.env.CLIENT_URL,
                process.env.FRONTEND_URL
            ].filter(Boolean),
            methods: ['GET', 'POST'],
            credentials: true,
            allowedHeaders: ['Content-Type', 'Authorization']
        };

        this.io = socketIO(httpServer, {
            cors: corsOptions,
            transports: ['websocket', 'polling'],
            pingTimeout: 600000,
            pingInterval: 25000,
            upgradeTimeout: 10000,
            maxHttpBufferSize: 1e6, // 1MB
            allowEIO3: true
        });

        this.setupMiddleware();
        this.setupConnectionHandling();
        this.setupEventHandlers();
        this.setupRoomManagement();
        this.setupQuizFeatures();
        this.setupHealthMonitoring();

        return this.io;
    }

    setupMiddleware() {
        // Authentication middleware
        this.io.use((socket, next) => {
            try {
                const token = socket.handshake.auth.token || 
                             socket.handshake.headers.authorization?.replace('Bearer ', '');
                
                if (token) {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    socket.userId = decoded.id;
                    socket.userEmail = decoded.email;
                    socket.userName = decoded.name;
                    socket.userRole = decoded.role;
                }
                
                next();
            } catch (error) {
                console.log('Socket auth failed:', error.message);
                // Allow anonymous connections but with limited features
                next();
            }
        });

        // Rate limiting middleware
        this.io.use((socket, next) => {
            const now = Date.now();
            if (!socket.rateLimitData) {
                socket.rateLimitData = {
                    requests: [],
                    lastReset: now
                };
            }

            // Reset rate limit every minute
            if (now - socket.rateLimitData.lastReset > 60000) {
                socket.rateLimitData.requests = [];
                socket.rateLimitData.lastReset = now;
            }

            // Allow 100 requests per minute
            if (socket.rateLimitData.requests.length >= 100) {
                return next(new Error('Rate limit exceeded'));
            }

            socket.rateLimitData.requests.push(now);
            next();
        });
    }

    setupConnectionHandling() {
        this.io.on('connection', (socket) => {
            this.connectionStats.totalConnections++;
            this.connectionStats.currentConnections++;
            
            if (this.connectionStats.currentConnections > this.connectionStats.peakConnections) {
                this.connectionStats.peakConnections = this.connectionStats.currentConnections;
                this.connectionStats.lastPeak = new Date();
            }

            console.log(`🔌 Client connected: ${socket.id} (${this.connectionStats.currentConnections} active)`);

            // Store user info if authenticated
            if (socket.userId) {
                this.onlineUsers.set(socket.id, {
                    socketId: socket.id,
                    userId: socket.userId,
                    email: socket.userEmail,
                    name: socket.userName,
                    role: socket.userRole,
                    joinedAt: new Date(),
                    lastActivity: new Date()
                });

                // Join user-specific room
                socket.join(`user-${socket.userId}`);
                
                // Notify other users about new user online
                socket.broadcast.emit('userOnline', {
                    userId: socket.userId,
                    name: socket.userName,
                    timestamp: new Date()
                });

                // Send updated online users list
                this.broadcastOnlineUsers();
            }

            // Handle disconnection
            socket.on('disconnect', (reason) => {
                this.connectionStats.currentConnections--;
                console.log(`🔌 Client disconnected: ${socket.id} (${reason})`);

                if (socket.userId) {
                    this.onlineUsers.delete(socket.id);
                    
                    // Notify others about user going offline
                    socket.broadcast.emit('userOffline', {
                        userId: socket.userId,
                        name: socket.userName,
                        timestamp: new Date()
                    });

                    this.broadcastOnlineUsers();
                }

                // Clean up rooms and sessions
                this.cleanupUserSessions(socket);
            });

            // Update user activity
            socket.onAny(() => {
                if (socket.userId) {
                    const user = this.onlineUsers.get(socket.id);
                    if (user) {
                        user.lastActivity = new Date();
                    }
                }
            });
        });
    }

    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            // Heartbeat/ping-pong
            socket.on('ping', (data) => {
                socket.emit('pong', {
                    ...data,
                    serverTime: new Date().toISOString()
                });
            });

            // User presence
            socket.on('updatePresence', (status) => {
                if (socket.userId) {
                    const user = this.onlineUsers.get(socket.id);
                    if (user) {
                        user.status = status; // online, away, busy, invisible
                        this.broadcastOnlineUsers();
                    }
                }
            });

            // Private messaging
            socket.on('privateMessage', (data) => {
                if (!socket.userId) return;

                const { recipientId, message, type = 'text' } = data;
                const recipientSocket = this.findUserSocket(recipientId);

                if (recipientSocket) {
                    recipientSocket.emit('privateMessage', {
                        senderId: socket.userId,
                        senderName: socket.userName,
                        message,
                        type,
                        timestamp: new Date()
                    });

                    // Send confirmation to sender
                    socket.emit('messageDelivered', {
                        recipientId,
                        timestamp: new Date()
                    });
                } else {
                    socket.emit('messageError', {
                        error: 'User not online',
                        recipientId
                    });
                }
            });

            // Typing indicators
            socket.on('typing', (data) => {
                if (!socket.userId) return;

                const { roomId, isTyping } = data;
                socket.to(roomId).emit('userTyping', {
                    userId: socket.userId,
                    userName: socket.userName,
                    isTyping,
                    timestamp: new Date()
                });
            });
        });
    }

    setupRoomManagement() {
        this.io.on('connection', (socket) => {
            // Join room
            socket.on('joinRoom', (data) => {
                const { roomId, roomType = 'chat' } = data;
                
                if (!roomId) return;

                socket.join(roomId);
                
                // Track user rooms
                if (!this.userRooms.has(socket.id)) {
                    this.userRooms.set(socket.id, new Set());
                }
                this.userRooms.get(socket.id).add(roomId);

                // Track room members
                if (!this.chatRooms.has(roomId)) {
                    this.chatRooms.set(roomId, {
                        type: roomType,
                        members: new Set(),
                        createdAt: new Date(),
                        lastActivity: new Date()
                    });
                }
                
                const room = this.chatRooms.get(roomId);
                room.members.add(socket.id);
                room.lastActivity = new Date();

                // Notify room about new member
                socket.to(roomId).emit('userJoinedRoom', {
                    userId: socket.userId,
                    userName: socket.userName,
                    roomId,
                    timestamp: new Date()
                });

                // Send room info to user
                socket.emit('roomJoined', {
                    roomId,
                    memberCount: room.members.size,
                    roomType: room.type
                });

                console.log(`📍 User ${socket.userName || socket.id} joined room: ${roomId}`);
            });

            // Leave room
            socket.on('leaveRoom', (roomId) => {
                this.leaveRoom(socket, roomId);
            });

            // Room message
            socket.on('roomMessage', (data) => {
                const { roomId, message, type = 'text' } = data;
                
                if (!roomId || !message) return;

                const messageData = {
                    messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    senderId: socket.userId,
                    senderName: socket.userName,
                    message,
                    type,
                    roomId,
                    timestamp: new Date()
                };

                // Broadcast to room
                this.io.to(roomId).emit('roomMessage', messageData);

                // Update room activity
                if (this.chatRooms.has(roomId)) {
                    this.chatRooms.get(roomId).lastActivity = new Date();
                }
            });
        });
    }

    setupQuizFeatures() {
        this.io.on('connection', (socket) => {
            // Join quiz session
            socket.on('joinQuiz', (data) => {
                const { quizId } = data;
                
                if (!quizId) return;

                const roomId = `quiz-${quizId}`;
                socket.join(roomId);

                // Track quiz session
                if (!this.quizSessions.has(quizId)) {
                    this.quizSessions.set(quizId, {
                        participants: new Map(),
                        startTime: null,
                        currentQuestion: null,
                        status: 'waiting' // waiting, active, completed
                    });
                }

                const session = this.quizSessions.get(quizId);
                session.participants.set(socket.id, {
                    socketId: socket.id,
                    userId: socket.userId,
                    userName: socket.userName,
                    joinedAt: new Date(),
                    answers: new Map(),
                    score: 0,
                    finished: false
                });

                // Notify others
                socket.to(roomId).emit('participantJoined', {
                    userId: socket.userId,
                    userName: socket.userName,
                    participantCount: session.participants.size
                });

                // Send session info
                socket.emit('quizJoined', {
                    quizId,
                    participantCount: session.participants.size,
                    status: session.status
                });
            });

            // Quiz answer submission
            socket.on('submitAnswer', (data) => {
                const { quizId, questionId, answer, timeSpent } = data;
                const session = this.quizSessions.get(quizId);
                
                if (!session) return;

                const participant = session.participants.get(socket.id);
                if (!participant) return;

                // Store answer
                participant.answers.set(questionId, {
                    answer,
                    timeSpent,
                    submittedAt: new Date()
                });

                // Notify quiz room about progress
                const roomId = `quiz-${quizId}`;
                socket.to(roomId).emit('participantProgress', {
                    userId: socket.userId,
                    userName: socket.userName,
                    questionsAnswered: participant.answers.size
                });
            });

            // Real-time quiz leaderboard
            socket.on('requestLeaderboard', (quizId) => {
                const session = this.quizSessions.get(quizId);
                if (!session) return;

                const leaderboard = Array.from(session.participants.values())
                    .map(p => ({
                        userId: p.userId,
                        userName: p.userName,
                        score: p.score,
                        questionsAnswered: p.answers.size,
                        finished: p.finished
                    }))
                    .sort((a, b) => b.score - a.score);

                socket.emit('leaderboardUpdate', { quizId, leaderboard });
            });
        });
    }

    setupHealthMonitoring() {
        // Periodic cleanup of inactive sessions
        setInterval(() => {
            this.cleanupInactiveSessions();
        }, 5 * 60 * 1000); // Every 5 minutes

        // Broadcast server statistics
        setInterval(() => {
            this.io.emit('serverStats', this.getServerStats());
        }, 30 * 1000); // Every 30 seconds
    }

    // Utility methods
    findUserSocket(userId) {
        for (const [socketId, user] of this.onlineUsers) {
            if (user.userId === userId) {
                return this.io.sockets.sockets.get(socketId);
            }
        }
        return null;
    }

    broadcastOnlineUsers() {
        const users = Array.from(this.onlineUsers.values()).map(user => ({
            userId: user.userId,
            name: user.name,
            status: user.status || 'online',
            lastActivity: user.lastActivity
        }));

        this.io.emit('onlineUsers', {
            users,
            count: users.length,
            timestamp: new Date()
        });
    }

    leaveRoom(socket, roomId) {
        socket.leave(roomId);
        
        if (this.userRooms.has(socket.id)) {
            this.userRooms.get(socket.id).delete(roomId);
        }

        if (this.chatRooms.has(roomId)) {
            const room = this.chatRooms.get(roomId);
            room.members.delete(socket.id);
            
            if (room.members.size === 0) {
                this.chatRooms.delete(roomId);
            } else {
                socket.to(roomId).emit('userLeftRoom', {
                    userId: socket.userId,
                    userName: socket.userName,
                    roomId,
                    timestamp: new Date()
                });
            }
        }
    }

    cleanupUserSessions(socket) {
        // Clean up user rooms
        if (this.userRooms.has(socket.id)) {
            const userRooms = this.userRooms.get(socket.id);
            for (const roomId of userRooms) {
                this.leaveRoom(socket, roomId);
            }
            this.userRooms.delete(socket.id);
        }

        // Clean up quiz sessions
        for (const [quizId, session] of this.quizSessions) {
            if (session.participants.has(socket.id)) {
                session.participants.delete(socket.id);
                
                const roomId = `quiz-${quizId}`;
                socket.to(roomId).emit('participantLeft', {
                    userId: socket.userId,
                    userName: socket.userName,
                    participantCount: session.participants.size
                });
                
                if (session.participants.size === 0) {
                    this.quizSessions.delete(quizId);
                }
            }
        }
    }

    cleanupInactiveSessions() {
        const now = new Date();
        const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

        // Clean up inactive chat rooms
        for (const [roomId, room] of this.chatRooms) {
            if (now - room.lastActivity > inactiveThreshold && room.members.size === 0) {
                this.chatRooms.delete(roomId);
                console.log(`🧹 Cleaned up inactive room: ${roomId}`);
            }
        }

        // Clean up completed quiz sessions
        for (const [quizId, session] of this.quizSessions) {
            const allFinished = Array.from(session.participants.values()).every(p => p.finished);
            if (allFinished && session.participants.size > 0) {
                // Keep session for 10 minutes after completion for final results
                if (now - session.lastActivity > 10 * 60 * 1000) {
                    this.quizSessions.delete(quizId);
                    console.log(`🧹 Cleaned up completed quiz session: ${quizId}`);
                }
            }
        }
    }

    getServerStats() {
        return {
            connections: this.connectionStats,
            onlineUsers: this.onlineUsers.size,
            activeRooms: this.chatRooms.size,
            quizSessions: this.quizSessions.size,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            timestamp: new Date()
        };
    }

    // Public methods
    getIO() {
        if (!this.io) {
            throw { message: 'Socket.IO not initialized!', statusCode: 500 };
        }
        return this.io;
    }

    getOnlineUsers() {
        return Array.from(this.onlineUsers.values());
    }

    getOnlineUserCount() {
        return this.onlineUsers.size;
    }

    getUserById(userId) {
        for (const user of this.onlineUsers.values()) {
            if (user.userId === userId) {
                return user;
            }
        }
        return null;
    }

    sendToUser(userId, event, data) {
        const socket = this.findUserSocket(userId);
        if (socket) {
            socket.emit(event, data);
            return true;
        }
        return false;
    }

    broadcastToRoom(roomId, event, data) {
        this.io.to(roomId).emit(event, data);
    }

    broadcastToAll(event, data) {
        this.io.emit(event, data);
    }
}

module.exports = new SocketManager();
