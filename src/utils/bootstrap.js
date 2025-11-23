const { cacheManager } = require("./global-helpers");
const { getDB } = require("./db-manager");

const initializeModels = async () => {
    return {
        User: await require('../modules/users/models/User')(),
        SubscribedUser: await require('../modules/users/models/SubscribedUser')(),
        PswdResetToken: await require('../modules/users/models/PswdResetToken')(),

        Category: await require('../modules/quizzing/models/Category')(),
        Quiz: await require('../modules/quizzing/models/Quiz')(),
        Question: await require('../modules/quizzing/models/Question')(),

        Advert: await require('../modules/posts/models/Advert')(),
        Faq: await require('../modules/posts/models/Faq')(),
        BlogPost: await require('../modules/posts/models/blog-posts/BlogPost')(),
        PostCategory: await require('../modules/posts/models/blog-posts/PostCategory')(),
        ImageUpload: await require('../modules/posts/models/blog-posts/ImageUpload')(),
        BlogPostsView: await require('../modules/posts/models/blog-posts/BlogPostsView')(),

        School: await require('../modules/schools/models/School')(),
        Level: await require('../modules/schools/models/Level')(),
        Faculty: await require('../modules/schools/models/Faculty')(),

        CourseCategory: await require('../modules/courses/models/CourseCategory')(),
        Course: await require('../modules/courses/models/Course')(),
        Chapter: await require('../modules/courses/models/Chapter')(),
        Notes: await require('../modules/courses/models/Notes')(),

        Score: await require('../modules/scores/models/Score')(),

        Download: await require('../modules/downloads/models/Download')(),

        Contact: await require('../modules/contacts/models/Contact')(),
        Broadcast: await require('../modules/contacts/models/Broadcast')(),
        ChatRoom: await require('../modules/contacts/models/ChatRoom')(),
        RoomMessage: await require('../modules/contacts/models/RoomMessage')(),

        Feedback: await require('../modules/feedbacks/models/Feedback')(),

        QuizComment: await require('../modules/comments/models/QuizComment')(),
        QuestionComment: await require('../modules/comments/models/QuestionComment')(),
    };
};

const initializeDatabases = async () => {
    const databases = [
        { name: 'users', uri: process.env.USERS_URI },
        { name: 'posts', uri: process.env.POSTS_URI },
        { name: 'quizzing', uri: process.env.QUIZZING_URI },
        { name: 'scores', uri: process.env.SCORES_URI },
        { name: 'schools', uri: process.env.SCHOOLS_URI },
        { name: 'courses', uri: process.env.COURSES_URI },
        { name: 'downloads', uri: process.env.DOWNLOADS_URI },
        { name: 'contacts', uri: process.env.CONTACTS_URI },
        { name: 'feedbacks', uri: process.env.FEEDBACKS_URI },
        { name: 'comments', uri: process.env.COMMENTS_URI }
    ];

    for (const db of databases) {
        try {
            await getDB(db.name, db.uri);
        } catch (err) {
            console.error(`Failed to connect to ${db.name}:`, err.message);
        }
    }

    await initializeModels();
};

const bootstrap = async () => {
    try {
        await cacheManager.connect();
        await initializeDatabases();

        console.log("✅ Bootstrap complete: Redis + DB + Models initialized");

    } catch (err) {
        console.error("❌ Bootstrap failed:", err);
        process.exit(1);
    }
};

module.exports = bootstrap;
