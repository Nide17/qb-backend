const { getBatchedQuestions, getBatchedQuizzes } = require("../quizzing/helpers");
const { getBatchedUsers } = require("../users/helpers");

const expandComments = async (comments) => {

    try {
        // Convert to plain objects to avoid mongoose issues
        const plainComments = comments.map(comment => comment.toObject ? comment.toObject() : comment);

        // Extract unique sender IDs for better efficiency
        const usersIDs = [...new Set(plainComments.map(cmt => cmt.sender?.toString()).filter(Boolean))];

        // Extract unique quiz IDs for better efficiency
        const quizzesIDs = [...new Set(plainComments.map(cmt => cmt.quiz?.toString()).filter(Boolean))];

        // Extract unique questions IDs for better efficiency
        const questionsIDs = [...new Set(plainComments.map(cmt => cmt.question?.toString()).filter(Boolean))];

        // Populating
        const batchedUsers = await getBatchedUsers(usersIDs);
        const batchedQuizzes = await getBatchedQuizzes(quizzesIDs);
        const batchedQuestions = await getBatchedQuestions(questionsIDs);

        // Map plainComments to expanded objects
        const expandedPlainComments = plainComments.map(comment => {
            const expandedComment = { ...comment };
            if (comment.sender) expandedComment.sender = batchedUsers.get(comment.sender.toString());
            if (comment.quiz) expandedComment.quiz = batchedQuizzes.get(comment.quiz.toString());
            if (comment.question) expandedComment.question = batchedQuestions.get(comment.question.toString());
            return expandedComment;
        });

        return expandedPlainComments || plainComments;
    } catch (err) {
        console.error(err.message);
        return comments;
    }
};

module.exports = { expandComments };
