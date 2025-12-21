const sessions = new Map();

module.exports = {
    join(quizId, socket) {
        if (!sessions.has(quizId)) {
            sessions.set(quizId, {
                participants: new Map(),
                status: "waiting",
                currentQuestion: null
            });
        }

        const session = sessions.get(quizId);
        session.participants.set(socket.id, {
            _id: socket.user?._id,
            name: socket.user?.name,
            score: 0,
            answers: {}
        });

        return session;
    },

    get(quizId) {
        return sessions.get(quizId);
    }
};
