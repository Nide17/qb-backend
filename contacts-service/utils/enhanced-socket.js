// Enhanced Socket.IO for Contacts Service
// Manages real-time contact and messaging features

const jwt = require('jsonwebtoken');

class ContactsSocketManager {
    constructor() {
        this.io = null;
        this.onlineUsers = new Map();
        this.adminSockets = new Map();
        this.activeChats = new Map();
        this.messageQueue = new Map();
        this.contactSessions = new Map();
        
        this.stats = {
            totalContacts: 0,
            activeChats: 0,
            messagesExchanged: 0,
            averageResponseTime: 0
        };
    }

    initialize(io) {
        this.io = io;
        this.setupNamespace();
        return this;
    }

    setupNamespace() {
        // Create contacts namespace
        const contactsNS = this.io.of('/contacts');
        
        contactsNS.use((socket, next) => {
            try {
                const token = socket.handshake.auth.token;
                if (token) {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    socket.userId = decoded.id;
                    socket.userEmail = decoded.email;
                    socket.userName = decoded.name;
                    socket.userRole = decoded.role;
                }
                next();
            } catch (error) {
                console.log('Contacts socket auth failed:', error.message);
                next(); // Allow anonymous contact forms
            }
        });

        contactsNS.on('connection', (socket) => {
            this.handleConnection(socket);
        });

        this.contactsNS = contactsNS;
    }

    handleConnection(socket) {
        console.log(`👥 Contact client connected: ${socket.id}`);

        // Register user if authenticated
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

            // Admin users join admin room
            if (socket.userRole === 'admin' || socket.userRole === 'superadmin') {
                socket.join('admins');
                this.adminSockets.set(socket.id, socket.userId);
                console.log(`👨‍💼 Admin ${socket.userName} joined admin room`);
            }

            // Join user-specific room
            socket.join(`user-${socket.userId}`);
        }

        this.setupEventHandlers(socket);

        socket.on('disconnect', (reason) => {
            this.handleDisconnection(socket, reason);
        });
    }

    setupEventHandlers(socket) {
        // Contact form submission
        socket.on('submitContactForm', async (data) => {
            try {
                const contactData = {
                    ...data,
                    socketId: socket.id,
                    submittedAt: new Date(),
                    status: 'pending',
                    id: `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                };

                // Store in active contacts
                this.contactSessions.set(contactData.id, contactData);
                this.stats.totalContacts++;

                // Notify all admins about new contact
                socket.to('admins').emit('newContactSubmission', {
                    id: contactData.id,
                    name: contactData.name,
                    email: contactData.email,
                    subject: contactData.subject,
                    priority: contactData.priority || 'normal',
                    submittedAt: contactData.submittedAt
                });

                // Send confirmation to user
                socket.emit('contactFormSubmitted', {
                    id: contactData.id,
                    message: 'Your message has been received. We will get back to you shortly.',
                    estimatedResponseTime: '24 hours'
                });

                // Auto-assign to available admin if configured
                this.autoAssignToAdmin(contactData);

                console.log(`📩 New contact form submitted: ${contactData.name} (${contactData.email})`);

            } catch (error) {
                console.error('Contact form submission error:', error);
                socket.emit('contactFormError', {
                    error: 'Failed to submit contact form. Please try again.',
                    details: error.message
                });
            }
        });

        // Admin claims contact
        socket.on('claimContact', (contactId) => {
            if (!this.isAdmin(socket)) return;

            const contact = this.contactSessions.get(contactId);
            if (!contact) {
                socket.emit('claimError', { error: 'Contact not found' });
                return;
            }

            if (contact.assignedAdmin) {
                socket.emit('claimError', { 
                    error: 'Contact already claimed by another admin',
                    assignedTo: contact.assignedAdmin.name
                });
                return;
            }

            // Assign contact to admin
            contact.assignedAdmin = {
                id: socket.userId,
                name: socket.userName,
                email: socket.userEmail,
                claimedAt: new Date()
            };
            contact.status = 'in_progress';

            // Notify all admins about assignment
            this.contactsNS.to('admins').emit('contactClaimed', {
                contactId,
                adminName: socket.userName,
                adminId: socket.userId
            });

            // Start chat session
            const chatRoomId = `contact-${contactId}`;
            socket.join(chatRoomId);
            
            this.activeChats.set(contactId, {
                roomId: chatRoomId,
                adminSocket: socket.id,
                userEmail: contact.email,
                startedAt: new Date(),
                messages: []
            });

            socket.emit('contactClaimed', {
                contactId,
                contact: contact,
                chatRoomId
            });

            console.log(`👨‍💼 Admin ${socket.userName} claimed contact: ${contactId}`);
        });

        // Send message in contact chat
        socket.on('sendContactMessage', (data) => {
            const { contactId, message, type = 'text' } = data;
            
            const chat = this.activeChats.get(contactId);
            const contact = this.contactSessions.get(contactId);
            
            if (!chat || !contact) {
                socket.emit('messageError', { error: 'Chat session not found' });
                return;
            }

            const messageData = {
                id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                contactId,
                senderId: socket.userId,
                senderName: socket.userName,
                senderRole: socket.userRole,
                message,
                type,
                timestamp: new Date()
            };

            // Store message
            chat.messages.push(messageData);
            this.stats.messagesExchanged++;

            // Broadcast to chat room
            this.contactsNS.to(chat.roomId).emit('contactMessage', messageData);

            // If this is from admin, also notify the original user if they're online
            if (this.isAdmin(socket)) {
                const userSocket = this.findUserByEmail(contact.email);
                if (userSocket) {
                    userSocket.emit('adminResponse', {
                        contactId,
                        adminName: socket.userName,
                        message,
                        timestamp: new Date()
                    });
                }
            }
        });

        // Mark contact as resolved
        socket.on('resolveContact', (contactId) => {
            if (!this.isAdmin(socket)) return;

            const contact = this.contactSessions.get(contactId);
            if (!contact) {
                socket.emit('resolveError', { error: 'Contact not found' });
                return;
            }

            contact.status = 'resolved';
            contact.resolvedAt = new Date();
            contact.resolvedBy = {
                id: socket.userId,
                name: socket.userName
            };

            // Calculate response time
            const responseTime = contact.resolvedAt - contact.submittedAt;
            this.updateAverageResponseTime(responseTime);

            // Notify all admins
            this.contactsNS.to('admins').emit('contactResolved', {
                contactId,
                resolvedBy: socket.userName,
                responseTime: Math.round(responseTime / (1000 * 60)) // minutes
            });

            // Clean up chat session
            const chat = this.activeChats.get(contactId);
            if (chat) {
                this.activeChats.delete(contactId);
                this.stats.activeChats--;
            }

            socket.emit('contactResolved', { contactId, contact });
            console.log(`✅ Contact resolved: ${contactId} by ${socket.userName}`);
        });

        // Get contact statistics
        socket.on('getContactStats', () => {
            if (!this.isAdmin(socket)) return;

            const stats = {
                ...this.stats,
                onlineAdmins: this.adminSockets.size,
                pendingContacts: Array.from(this.contactSessions.values())
                    .filter(c => c.status === 'pending').length,
                activeContacts: Array.from(this.contactSessions.values())
                    .filter(c => c.status === 'in_progress').length
            };

            socket.emit('contactStats', stats);
        });

        // Join contact chat (for user to rejoin their contact session)
        socket.on('joinContactChat', (contactId) => {
            const contact = this.contactSessions.get(contactId);
            if (!contact) return;

            // Verify user owns this contact or is admin
            const isOwner = contact.email === socket.userEmail;
            const isAdmin = this.isAdmin(socket);
            
            if (!isOwner && !isAdmin) return;

            const chatRoomId = `contact-${contactId}`;
            socket.join(chatRoomId);

            // Send chat history
            const chat = this.activeChats.get(contactId);
            if (chat) {
                socket.emit('contactChatHistory', {
                    contactId,
                    messages: chat.messages,
                    status: contact.status
                });
            }
        });

        // Typing indicators for contact chats
        socket.on('contactTyping', (data) => {
            const { contactId, isTyping } = data;
            const chat = this.activeChats.get(contactId);
            
            if (chat) {
                socket.to(chat.roomId).emit('contactUserTyping', {
                    contactId,
                    userName: socket.userName,
                    userRole: socket.userRole,
                    isTyping,
                    timestamp: new Date()
                });
            }
        });

        // Get all pending contacts (admin only)
        socket.on('getPendingContacts', () => {
            if (!this.isAdmin(socket)) return;

            const pendingContacts = Array.from(this.contactSessions.values())
                .filter(c => c.status === 'pending')
                .map(c => ({
                    id: c.id,
                    name: c.name,
                    email: c.email,
                    subject: c.subject,
                    priority: c.priority,
                    submittedAt: c.submittedAt
                }))
                .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

            socket.emit('pendingContacts', pendingContacts);
        });
    }

    handleDisconnection(socket, reason) {
        console.log(`👥 Contact client disconnected: ${socket.id} (${reason})`);

        // Remove from online users
        this.onlineUsers.delete(socket.id);

        // Remove from admin sockets if admin
        if (this.adminSockets.has(socket.id)) {
            this.adminSockets.delete(socket.id);
        }

        // Handle active chats
        for (const [contactId, chat] of this.activeChats.entries()) {
            if (chat.adminSocket === socket.id) {
                // Admin disconnected, notify other admins
                this.contactsNS.to('admins').emit('adminDisconnected', {
                    contactId,
                    adminName: socket.userName,
                    chatRoomId: chat.roomId
                });

                // Don't close the chat immediately, allow other admins to take over
                chat.adminSocket = null;
            }
        }
    }

    // Utility methods
    isAdmin(socket) {
        return socket.userRole === 'admin' || socket.userRole === 'superadmin';
    }

    findUserByEmail(email) {
        for (const user of this.onlineUsers.values()) {
            if (user.email === email) {
                return this.contactsNS.sockets.get(user.socketId);
            }
        }
        return null;
    }

    autoAssignToAdmin(contactData) {
        // Simple round-robin assignment to available admins
        const availableAdmins = Array.from(this.adminSockets.entries());
        
        if (availableAdmins.length > 0) {
            const [socketId] = availableAdmins[this.stats.totalContacts % availableAdmins.length];
            const adminSocket = this.contactsNS.sockets.get(socketId);
            
            if (adminSocket) {
                // Auto-assign after 5 minutes if no admin claims it
                setTimeout(() => {
                    const contact = this.contactSessions.get(contactData.id);
                    if (contact && !contact.assignedAdmin) {
                        adminSocket.emit('autoAssignedContact', {
                            contactId: contactData.id,
                            contact: contactData,
                            reason: 'Auto-assigned due to no manual claim'
                        });
                    }
                }, 5 * 60 * 1000);
            }
        }
    }

    updateAverageResponseTime(newResponseTime) {
        const currentAvg = this.stats.averageResponseTime;
        const resolvedCount = Array.from(this.contactSessions.values())
            .filter(c => c.status === 'resolved').length;
        
        if (resolvedCount === 1) {
            this.stats.averageResponseTime = newResponseTime;
        } else {
            this.stats.averageResponseTime = ((currentAvg * (resolvedCount - 1)) + newResponseTime) / resolvedCount;
        }
    }

    // Public API
    notifyAdmins(event, data) {
        this.contactsNS.to('admins').emit(event, data);
    }

    getContactById(contactId) {
        return this.contactSessions.get(contactId);
    }

    getActiveChats() {
        return Array.from(this.activeChats.entries()).map(([id, chat]) => ({
            contactId: id,
            ...chat
        }));
    }

    getStats() {
        return {
            ...this.stats,
            onlineUsers: this.onlineUsers.size,
            onlineAdmins: this.adminSockets.size,
            activeSessions: this.contactSessions.size
        };
    }

    broadcastToAdmins(event, data) {
        this.contactsNS.to('admins').emit(event, data);
    }

    sendToUser(userId, event, data) {
        this.contactsNS.to(`user-${userId}`).emit(event, data);
    }
}

module.exports = new ContactsSocketManager();
