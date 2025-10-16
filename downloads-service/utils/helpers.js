const axios = require('axios');

// Helper function to call other services
const callService = async (url, timeout = 20000) => {

    if (!url || typeof url !== 'string' || url.startsWith('undefined')) return null;

    try {
        const response = await axios.get(url, {
            timeout: timeout, // 20 seconds default timeout for normal requests, longer for long running tasks
            headers: { 'Content-Type': 'application/json' }
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
            throw new Error(`Missing required field: ${field.name}`);
        }
    }
};

// Helper function to populate related entity details based on download type
const populateDownload = async (download) => {
    try {
        let [notes, downloaded_by] = await Promise.all([
            callService(`${process.env.NOTES_SERVICE_URL}/api/notes/${download.notes}`),
            callService(`${process.env.USERS_SERVICE_URL}/api/users/${download.downloaded_by}`)
        ]);
        return { ...download.toObject(), notes, chapter: notes ? notes.chapter : null, course: notes ? notes.course : null, courseCategory: notes ? notes.courseCategory : null, downloaded_by };
    } catch (err) {
        console.error('Error populating download details:', err.message);
        return download; // Return original download if population fails
    }
};

module.exports = {
    populateDownload,
    callService,
    validateRequiredFields,
};