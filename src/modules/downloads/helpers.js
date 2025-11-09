const { getBatchedNotes } = require('../courses/helpers');
const { getBatchedUsers } = require('../users/helpers');

// Populate array of downloads
const expandDownloads = async (downloads) => {

    if (!downloads) throw { status: 404, message: 'No downloads found!' };

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

module.exports = { expandDownloads };
