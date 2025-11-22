const { getDB } = require("./db-manager");
const { cacheManager } = require("./global-helpers");

const initializeModels = async () => {
    return {

        // Users
        User: await require('../modules/users/models/User')(),
        SubscribedUser: await require('../modules/users/models/SubscribedUser')(),
        PswdResetToken: await require('../modules/users/models/PswdResetToken')(),

        // Quizzing
        Category: await require('../modules/quizzing/models/Category')(),
        Quiz: await require('../modules/quizzing/models/Quiz')(),
        Question: await require('../modules/quizzing/models/Question')(),

        // Posts
        Advert: await require('../modules/posts/models/Advert')(),
        Faq: await require('../modules/posts/models/Faq')(),
        BlogPost: await require('../modules/posts/models/blog-posts/BlogPost')(),
        PostCategory: await require('../modules/posts/models/blog-posts/PostCategory')(),
        ImageUpload: await require('../modules/posts/models/blog-posts/ImageUpload')(),
        BlogPostsView: await require('../modules/posts/models/blog-posts/BlogPostsView')(),

        // Schools
        School: await require('../modules/schools/models/School')(),
        Level: await require('../modules/schools/models/Level')(),
        Faculty: await require('../modules/schools/models/Faculty')(),

        // Courses
        CourseCategory: await require('../modules/courses/models/CourseCategory')(),
        Course: await require('../modules/courses/models/Course')(),
        Chapter: await require('../modules/courses/models/Chapter')(),
        Notes: await require('../modules/courses/models/Notes')(),

        // Scores
        Score: await require('../modules/scores/models/Score')(),

        // Downloads
        Download: await require('../modules/downloads/models/Download')(),

        // Contacts
        Contact: await require('../modules/contacts/models/Contact')(),
        Broadcast: await require('../modules/contacts/models/Broadcast')(),
        ChatRoom: await require('../modules/contacts/models/ChatRoom')(),
        RoomMessage: await require('../modules/contacts/models/RoomMessage')(),

        // Feedbacks
        Feedback: await require('../modules/feedbacks/models/Feedback')(),

        // Comments
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

    // Initialize models
    await initializeModels();
    console.log('✅ Databases & models initialized');
}

const bootstrap = async (server) => {
    try {
        await cacheManager.connect();
        await initializeDatabases();
        await initializeModels();

        server.listen(process.env.PORT || 5000, () =>
            console.log(`🚀 Server running on port ${process.env.PORT}`)
        );

    } catch (err) {
        console.error("❌ Server failed to start:", err);
        process.exit(1);
    }
};

module.exports = bootstrap;
