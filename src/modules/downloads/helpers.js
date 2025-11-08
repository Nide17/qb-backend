const { getBatchedNotes } = require('../courses/helpers');
const { getBatchedUsers } = require('../users/helpers');

// Helper function to populate related entity details based on download type
const populateOneDownload = async (download) => {

    let downloadObj = download.toObject ? download.toObject() : download;
    try {
        let [notes, downloaded_by] = await Promise.all([
            getFromService(`${process.env.COURSES_SERVICE_URL}/api/notes/${download.notes}`),
            getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${download.downloaded_by}`)
        ]);

        return { ...downloadObj, notes, chapter: notes ? notes.chapter : null, course: notes ? notes.course : null, courseCategory: notes ? notes.courseCategory : null, downloaded_by };
    } catch (err) {
        return downloadObj; // Return original download if population fails
    }
};

const populateBatchedUsers = async (usersIDs) => {

    if (!usersIDs || usersIDs.length === 0) return usersIDs;

    try {
        const response = await axios.post(`${process.env.USERS_SERVICE_URL}/api/users/batch`, { usersIDs }, { timeout: 20000 });
        const usersMap = new Map();
        for (const user of response.data || []) {
            usersMap.set(user._id.toString(), user);
        }
        return usersMap;
    } catch (err) {
        return new Map();
    }
};

// Populate array of downloads
const populateBatchedDownloads = async (downloads) => {

    if (!downloads || downloads.length === 0) return downloads;

    try {
        // Convert to plain objects to avoid mongoose issues
        const plainDwds = downloads.map(dwd => dwd.toObject ? dwd.toObject() : dwd);

        // Extract unique note IDs for better efficiency
        const notesIDs = [...new Set(plainDwds.map(d => d.notes?.toString()))];

        // Extract unique user IDs for better efficiency
        const usersIDs = [...new Set(plainDwds.map(d => d.downloaded_by?.toString()))];

        // Populating
        const batchedNotes = await getBatchedNotes(notesIDs);
        const batchedUsers = await getBatchedUsers(usersIDs);

        // Map plainDwds to expanded objects
        const expandedPlainDwds = plainDwds.map(dwd => {
            const expandedDwd = { ...dwd };

            if (dwd.notes) {
                let notes = batchedNotes.get(dwd.notes.toString());

                if (notes) {
                    expandedDwd.notes = {
                        _id: notes._id,
                        title: notes.title,
                    };
                    expandedDwd.chapter = {
                        _id: notes.chapter._id,
                        title: notes.chapter.title
                    }
                    expandedDwd.course = {
                        _id: notes.course._id,
                        title: notes.course.title
                    }
                    expandedDwd.courseCategory = {
                        _id: notes.courseCategory._id,
                        title: notes.courseCategory.title
                    }
                }
            }

            if (dwd.downloaded_by) {
                expandedDwd.downloaded_by = batchedUsers.get(dwd.downloaded_by.toString());
            }
            return expandedDwd;
        });

        return expandedPlainDwds || plainDwds;
    } catch (err) {
        console.error(err.message);
        return {}
    }
};

module.exports = {
    populateOneDownload,
    populateBatchedDownloads,
};
