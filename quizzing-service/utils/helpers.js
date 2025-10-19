const axios = require('axios');
const Quiz = require("../models/Quiz");
const { S3 } = require("@aws-sdk/client-s3");

const s3Config = new S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    Bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION
});

// Helper function to call other services
const callService = async (url, timeout = 20000, token) => {

    if (!url || typeof url !== 'string' || url.startsWith('undefined')) return null;

    try {
        const response = await axios.get(url, {
            timeout, // 20 seconds default timeout for normal requests, longer for long running tasks
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            }
        });
        return response.data;
    } catch (err) {
        console.warn(`\n\nService call failed for URL: ${url}\nError:`, err.name, err.message);
        return null;
    }
};

// Simple population function for users
const populateUser = async (userId) => {
    if (!userId) return null;
    const data = await callService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);

    return data ? {
        _id: data._id,
        name: data.name
    } : { _id: userId, name: 'Unknown User' };
};

// Simple population function for category
const populateCategory = async (category) => {
    if (!category) return null;

    let categoryObj = category.toObject ? category.toObject() : category;

    try {
        // Fetch courseCategory details
        if (category.courseCategory) {
            const categoryData = await callService(`${process.env.COURSES_SERVICE_URL}/api/course-categories/${category.courseCategory}`);
            if (categoryData) {
                categoryObj.courseCategory = categoryData;
            }
        }

        if (category.created_by) {
            const userData = await populateUser(category.created_by);
            if (userData) {
                categoryObj.created_by = userData;
            }
        }

        return categoryObj;
    } catch (error) {
        console.log('Error populating category details:', error.message);
        return categoryObj;
    }
};

// Helper function to validate required fields
const validateRequiredFields = (fields) => {
    for (const field of fields) {
        if (!field.value) {
            throw new Error(`Missing required field: ${field.name}`);
        }
    }
};

const updateQuizQuestions = async (quizId, questionId, action) => {

    const quiz = await Quiz.findById(quizId);

    if (!quiz) throw new Error('Quiz not found while updating questions!');

    if (action === 'add') {
        quiz.questions.push(questionId);
    } else if (action === 'remove') {
        quiz.questions.pull(questionId);
    }
    await quiz.save().then(quiz => {
        return quiz;
    }).catch(err => {
        throw new Error('Error updating quiz questions!');
    })
};

// Helper function to delete image from S3
const deleteImageFromS3 = async (imagePath) => {
    const params = {
        Bucket: process.env.S3_BUCKET,
        Key: imagePath.split('/').pop()
    };
    return s3Config.deleteObject(params).promise();
};

// Populate single quiz
const populateQuiz = async (quiz) => {
    if (!quiz) return quiz;

    // Convert to plain object to avoid mongoose issues
    const plainQuiz = quiz.toObject ? quiz.toObject() : quiz;

    if (plainQuiz.created_by) {
        plainQuiz.created_by = await populateUser(plainQuiz.created_by);
    }

    return plainQuiz;
};

// Populate array of quizzes
const populateQuizzes = async (quizzes) => {

    if (!quizzes || quizzes.length === 0) return quizzes;

    // Convert to plain objects to avoid mongoose issues
    const plainQuizzes = quizzes.map(quiz => quiz.toObject ? quiz.toObject() : quiz);

    for (let quiz of plainQuizzes) {

        if (quiz.created_by) {
            quiz.created_by = await populateUser(quiz.created_by);
        }

        if (quiz.last_updated_by) {
            quiz.last_updated_by = await populateUser(quiz.last_updated_by);
        }
    }

    return plainQuizzes;
};


module.exports = {
    callService, validateRequiredFields, populateUser, populateCategory, updateQuizQuestions, deleteImageFromS3, populateQuiz, populateQuizzes
};