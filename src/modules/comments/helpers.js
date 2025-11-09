const { getBatchedQuestionsMap, getBatchedQuizzesMap } = require("../quizzing/helpers");
const { getBatchedUsersMap } = require("../users/helpers");

const expandComments = async (comments) => {

    try {
        if (!comments) throw { status: 404, message: 'No comments provided!' };

        // Extract unique IDs
        const usersIDs = [...new Set(comments.map(cmt => cmt.sender?.toString()).filter(Boolean))];
        const quizzesIDs = [...new Set(comments.map(cmt => cmt.quiz?.toString()).filter(Boolean))];
        const questionsIDs = [...new Set(comments.map(cmt => cmt.question?.toString()).filter(Boolean))];

        // Populating
        const usersMap = await getBatchedUsersMap(usersIDs);
        const quizzesMap = await getBatchedQuizzesMap(quizzesIDs);
        const questionsMap = await getBatchedQuestionsMap(questionsIDs);

        // Map comments to expanded objects
        const expandedComments = comments.map(comment => {
            const expandedComment = { ...comment };
            if (comment.sender) expandedComment.sender = usersMap.get(comment.sender.toString());
            if (comment.quiz) expandedComment.quiz = quizzesMap.get(comment.quiz.toString());
            if (comment.question) expandedComment.question = questionsMap.get(comment.question.toString());
            return expandedComment;
        });

        return expandedComments || comments;
    } catch (err) {
        console.error(err.message);
        return comments;
    }
};

module.exports = { expandComments };
