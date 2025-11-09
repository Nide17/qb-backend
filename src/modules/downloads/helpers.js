const { getBatchedNotesMap } = require('../courses/helpers');
const { getBatchedUsersMap } = require('../users/helpers');

// Expand array of downloads
const expandDownloads = async (downloads) => {

    if (!downloads) throw { status: 404, message: 'No downloads found!' };

    try {
        // Extract unique IDs
        const notesIDs = [...new Set(downloads.map(d => d.notes?.toString()))];
        const usersIDs = [...new Set(downloads.map(d => d.downloaded_by?.toString()))];

        // Populating
        const notesMap = await getBatchedNotesMap(notesIDs);
        const usersMap = await getBatchedUsersMap(usersIDs);

        // Map downloads to expanded objects
        const expandedDownloads = downloads.map(dwd => {
            const expandedDwd = { ...dwd };

            if (dwd.notes) {
                let notes = notesMap.get(dwd.notes.toString());

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
                expandedDwd.downloaded_by = usersMap.get(dwd.downloaded_by.toString());
            }
            return expandedDwd;
        });

        return expandedDownloads || downloads;
    } catch (err) {
        console.error(err.message);
        return downloads;
    }
};

module.exports = { expandDownloads };
