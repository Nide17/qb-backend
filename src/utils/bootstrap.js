// utils/bootstrap.js
const { getDB } = require("./db-manager");

async function bootstrap() {
    await Promise.all([
        getDB("users", process.env.USERS_URI),
        getDB("quizzing", process.env.QUIZZING_URI),
        getDB("courses", process.env.COURSES_URI),
        getDB("posts", process.env.POSTS_URI),
        getDB("schools", process.env.SCHOOLS_URI),
        getDB("scores", process.env.SCORES_URI),
        getDB("downloads", process.env.DOWNLOADS_URI),
        getDB("contacts", process.env.CONTACTS_URI),
        getDB("feedbacks", process.env.FEEDBACKS_URI),
        getDB("comments", process.env.COMMENTS_URI),
    ]);

    console.log("✔ All databases initialized & models attached");
}

module.exports = bootstrap;
