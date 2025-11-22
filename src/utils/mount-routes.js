module.exports = (app) => {

    // Users
    app.use('/api/users', require('../modules/users/routes/users'));
    app.use('/api/subscribed-users', require('../modules/users/routes/subscribed-users'));

    // Quizzing
    app.use('/api/categories', require('../modules/quizzing/routes/categories'));
    app.use('/api/quizzes', require('../modules/quizzing/routes/quizzes'));
    app.use('/api/questions', require('../modules/quizzing/routes/questions'));

    // Posts
    app.use('/api/adverts', require('../modules/posts/routes/adverts'));
    app.use('/api/faqs', require('../modules/posts/routes/faqs'));
    app.use('/api/blog-posts', require('../modules/posts/routes/blog-posts/blog-posts'));
    app.use('/api/post-categories', require('../modules/posts/routes/blog-posts/post-categories'));
    app.use('/api/image-uploads', require('../modules/posts/routes/blog-posts/image-uploads'));
    app.use('/api/blog-posts-views', require('../modules/posts/routes/blog-posts/blog-posts-views'));

    // Schools
    app.use('/api/schools', require('../modules/schools/routes/schools'));
    app.use('/api/levels', require('../modules/schools/routes/levels'));
    app.use('/api/faculties', require('../modules/schools/routes/faculties'));

    // Courses
    app.use('/api/course-categories', require('../modules/courses/routes/course-categories'));
    app.use('/api/courses', require('../modules/courses/routes/courses'));
    app.use('/api/chapters', require('../modules/courses/routes/chapters'));
    app.use('/api/notes', require('../modules/courses/routes/notes'));

    // Scores
    app.use('/api/scores', require('../modules/scores/routes/scores'));

    // Downloads
    app.use('/api/downloads', require('../modules/downloads/routes/downloads'));

    // Contacts
    app.use('/api/contacts', require('../modules/contacts/routes/contacts'));
    app.use('/api/broadcasts', require('../modules/contacts/routes/broadcasts'));
    app.use('/api/chat-rooms', require('../modules/contacts/routes/chat-rooms'));
    app.use('/api/room-messages', require('../modules/contacts/routes/room-messages'));

    // Feedbacks
    app.use('/api/feedbacks', require('../modules/feedbacks/routes/feedbacks'));

    // Comments
    app.use('/api/quizzes-comments', require('../modules/comments/routes/quizzes-comments'));
    app.use('/api/questions-comments', require('../modules/comments/routes/questions-comments'));

    // Statistics
    app.use('/api/statistics', require('../modules/statistics/routes/statistics'));
}
