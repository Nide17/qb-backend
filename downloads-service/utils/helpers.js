const axios = require('axios');

// Helper function to call other services
const getFromService = async (url, timeout = 60000, token) => {

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

// Generalized helper function to validate required fields
const validateRequiredFields = (fields) => {
    for (const field of fields) {
        if (!field.value) {
            throw { message: `Missing required field: ${field.name}`, statusCode: 400 };
        }
    }
};

// Helper function to populate related entity details based on download type
const populateDownload = async (download) => {

    let downloadObj = download.toObject ? download.toObject() : download;
    try {
        let [notes, downloaded_by] = await Promise.all([
            getFromService(`${process.env.COURSES_SERVICE_URL}/api/notes/${download.notes}`),
            getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${download.downloaded_by}`)
        ]);

        return { ...downloadObj, notes, chapter: notes ? notes.chapter : null, course: notes ? notes.course : null, courseCategory: notes ? notes.courseCategory : null, downloaded_by };
    } catch (err) {
        console.error('Error populating download details:', err.message);
        return download; // Return original download if population fails
    }
};

module.exports = {
    populateDownload,
    getFromService,
    validateRequiredFields,
};
