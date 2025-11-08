const populateOneUser = async (userId) => {

    if (!userId) return null;

    try {
        const usr = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);

        return usr ? {
            _id: usr._id,
            name: usr.name
        } : { _id: userId, name: 'Unknown User' };
    } catch (err) {
        return { _id: userId, name: 'Unknown User' };
    }
};

const populateOneComment = async (comment) => {

    if (!comment) return null;
    let commentObj = comment.toObject ? comment.toObject() : comment;

    try {
        // Fetch question - Questions Comments
        if (comment.question && comment.quiz) {
            const questionData = await getFromService(`${process.env.QUIZZING_SERVICE_URL}/api/questions/${comment.question}`);
            if (questionData) {
                commentObj.question = {
                    _id: questionData._id,
                    questionText: questionData.questionText
                };
                commentObj.quiz = {
                    _id: questionData.quiz._id,
                    title: questionData.quiz.title
                };
            }
            // Quizzes Comments
        } else if (!comment.question && comment.quiz) {
            const quizData = await getFromService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes/${comment.quiz}`);
            if (quizData) {
                commentObj.quiz = {
                    _id: quizData._id,
                    title: quizData.title
                };
            }
        }

        if (comment.sender) {
            const userData = await populateOneUser(comment.sender);
            if (userData) {
                commentObj.sender = userData;
            }
        }

        return commentObj;
    } catch (error) {
        return commentObj;
    }
};

const populateBatchedComments = async (comments) => {

    if (!comments || comments.length === 0) return [];

    // Convert all comments to plain objects first to ensure consistent access
    const plainComments = comments.map(comment => {
        if (comment.toObject) {
            return comment.toObject();
        }
        return comment;
    });

    // Collect all IDs needed
    const questionsIds = plainComments
        .filter(c => c.question) // Only include comments with questions
        .map(c => typeof c.question === 'object' ? c.question.toString() : c.question);

    const usersIDs = plainComments
        .filter(c => c.sender) // Only include comments with senders
        .map(c => typeof c.sender === 'object' ? c.sender.toString() : c.sender);

    const quizzesIDs = plainComments
        .filter(c => c.quiz && !c.question) // Only include quiz comments without questions
        .map(c => typeof c.quiz === 'object' ? c.quiz.toString() : c.quiz);

    try {
        // Create maps for quick lookup
        const questionsMap = new Map();
        const usersMap = new Map();
        const quizzesMap = new Map();

        // Batch fetch questions
        if (questionsIds.length > 0) {
            try {
                const questionsResponse = await axios.post(
                    `${process.env.QUIZZING_SERVICE_URL}/api/questions/batch`,
                    { questionsIds },
                    { timeout: 200000 }
                );

                if (questionsResponse?.data?.length) {
                    questionsResponse.data.forEach(question => {
                        questionsMap.set(question._id, question);
                    });
                }
            } catch (err) {
                console.error('Error fetching questions:', err.message);
            }
        }

        // Batch fetch users
        if (usersIDs.length > 0) {
            try {
                const usersResponse = await axios.post(
                    `${process.env.USERS_SERVICE_URL}/api/users/batch`,
                    { usersIDs },
                    { timeout: 200000 }
                );

                if (usersResponse?.data?.length) {
                    usersResponse.data.forEach(user => {
                        usersMap.set(user._id, user);
                    });
                }
            } catch (err) {
                console.error('Error fetching users:', err.message);
            }
        }

        // Batch fetch quizzes
        if (quizzesIDs.length > 0) {
            try {
                const quizzesResponse = await axios.post(
                    `${process.env.QUIZZING_SERVICE_URL}/api/quizzes/batch`,
                    { quizzesIDs },
                    { timeout: 200000 }
                );

                if (quizzesResponse?.data?.length) {
                    quizzesResponse.data.forEach(quiz => {
                        quizzesMap.set(quiz._id, quiz);
                    });
                }
            } catch (err) {
                console.error('Error fetching quizzes:', err.message);
            }
        }

        // Process all comments with fetched data
        return plainComments.map(comment => {
            // Create a new object to avoid mutating the original
            const commentObj = { ...comment };

            // Handle question comments
            if (comment.question && comment.quiz) {
                const questionId = typeof comment.question === 'object' ? comment.question.toString() : comment.question;
                const question = questionsMap.get(questionId);

                if (question) {
                    commentObj.question = {
                        _id: question._id,
                        questionText: question.questionText
                    };

                    // Get quiz from question or quiz map
                    if (question.quiz) {
                        commentObj.quiz = {
                            _id: question.quiz._id,
                            title: question.quiz.title
                        };
                    }
                } else {
                    commentObj.question = { _id: questionId, questionText: 'Unknown Question' };
                    commentObj.quiz = { _id: comment.quiz, title: 'Unknown Quiz' };
                }
            }
            // Handle quiz comments without questions
            else if (comment.quiz) {
                const quizId = typeof comment.quiz === 'object' ? comment.quiz.toString() : comment.quiz;
                const quiz = quizzesMap.get(quizId);

                if (quiz) {
                    commentObj.quiz = {
                        _id: quiz._id,
                        title: quiz.title
                    };
                } else {
                    commentObj.quiz = { _id: quizId, title: 'Unknown Quiz' };
                }
            }

            // Handle user data
            if (comment.sender) {
                const senderId = typeof comment.sender === 'object' ? comment.sender.toString() : comment.sender;
                const user = usersMap.get(senderId);

                if (user) {
                    commentObj.sender = {
                        _id: user._id,
                        name: user.name
                    };
                } else {
                    commentObj.sender = { _id: senderId, name: 'Unknown User' };
                }
            }

            return commentObj;
        });

    } catch (error) {
        console.error("Error in populateBatchedComments:", error.message);
        return plainComments; // Return original comments if error occurs
    }
};

module.exports = {
    populateOneComment,
    populateBatchedComments,
};
