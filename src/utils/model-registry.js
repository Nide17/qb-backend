// utils/model-registry.js

module.exports = {
    users: {
        User: require("../modules/users/models/User").schema,
        SubscribedUser: require("../modules/users/models/SubscribedUser").schema,
        PswdResetToken: require("../modules/users/models/PswdResetToken").schema,
    },

    quizzing: {
        Category: require("../modules/quizzing/models/Category").schema,
        Quiz: require("../modules/quizzing/models/Quiz").schema,
        Question: require("../modules/quizzing/models/Question").schema,
    },

    courses: {
        CourseCategory: require("../modules/courses/models/CourseCategory").schema,
        Course: require("../modules/courses/models/Course").schema,
        Chapter: require("../modules/courses/models/Chapter").schema,
        Notes: require("../modules/courses/models/Notes").schema,
    },

    posts: {
        Advert: require("../modules/posts/models/Advert").schema,
        Faq: require("../modules/posts/models/Faq").schema,
        PostCategory: require("../modules/posts/models/blog-posts/PostCategory").schema,
        BlogPost: require("../modules/posts/models/blog-posts/BlogPost").schema,
        BlogPostsView: require("../modules/posts/models/blog-posts/BlogPostsView").schema,
        ImageUpload: require("../modules/posts/models/blog-posts/ImageUpload").schema,
    },

    schools: {
        School: require("../modules/schools/models/School").schema,
        Level: require("../modules/schools/models/Level").schema,
        Faculty: require("../modules/schools/models/Faculty").schema,
    },

    scores: {
        Score: require("../modules/scores/models/Score").schema,
    },

    downloads: {
        Download: require("../modules/downloads/models/Download").schema,
    },

    contacts: {
        Contact: require("../modules/contacts/models/Contact").schema,
        Broadcast: require("../modules/contacts/models/Broadcast").schema,
        ChatRoom: require("../modules/contacts/models/ChatRoom").schema,
        RoomMessage: require("../modules/contacts/models/RoomMessage").schema,
    },

    feedbacks: {
        Feedback: require("../modules/feedbacks/models/Feedback").schema,
    },

    comments: {
        QuizComment: require("../modules/comments/models/QuizComment").schema,
        QuestionComment: require("../modules/comments/models/QuestionComment").schema,
    },
};
