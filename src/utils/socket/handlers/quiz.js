const QuizStore = require('../services/quizStore');

module.exports = function quizHandler(io, socket) {
    socket.on("joinQuiz", ({ quizId }) => {
        const session = QuizStore.join(quizId, socket);

        socket.join(`quiz-${quizId}`);

        io.to(`quiz-${quizId}`).emit("participantJoined", {
            name: socket.user.name,
            total: session.participants.size
        });
    });

    socket.on("submitAnswer", ({ quizId, questionId, answer }) => {
        const session = QuizStore.get(quizId);
        if (!session) return;

        const participant = session.participants.get(socket.id);
        participant.answers[questionId] = answer;

        io.to(`quiz-${quizId}`).emit("participantProgress", {
            name: participant.name,
            answered: Object.keys(participant.answers).length
        });
    });
};
