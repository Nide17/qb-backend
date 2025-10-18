const axios = require('axios');
const Download = require("../models/Download");
const { populateDownload, validateRequiredFields, getCachedData, setCachedData, cache } = require('../utils/helpers');
const { handleError } = require('../../contacts-service/utils/error');

exports.getDownloads = async (req, res) => {

    try {
        // Pagination - ENFORCE pagination to prevent memory exhaustion
        const totalDownloads = await Download.countDocuments({});
        var PAGE_SIZE = 20;
        var pageNo = parseInt(req.query.pageNo || "1");
        var query = {};

        query.limit = PAGE_SIZE;
        query.skip = PAGE_SIZE * (pageNo - 1);

        let downloads = await Download.find({}, {}, query).sort({ createdAt: -1 }).lean();

        if (!downloads || downloads.length === 0) {
            return res.status(204).json({ message: 'No downloads found!' });
        }

        if (req.query?.filter === 'stats') return res.status(200).json(totalDownloads)

        // Populate downloads
        for (let i = 0; i < downloads.length; i++) {
            downloads[i] = await populateDownload(downloads[i]);
        }

        res.status(200).json({
            totalPages: Math.ceil(totalDownloads / PAGE_SIZE),
            page: pageNo,
            pageSize: PAGE_SIZE,
            totalDownloads,
            downloads
        });
    } catch (error) {
        console.log('Error getting downloads:', error.message);
        handleError(res, error);
    }
};

exports.getOneDownload = async (req, res) => {
    try {
        let download = await Download.findById(req.params.id).lean();
        if (!download) {
            return res.status(404).json({ error: 'Download not found!' });
        }
        res.stats(200).json(download)
    } catch (error) {
        console.log('Error getting download:', error.message);
        handleError(res, error);
    }
};

exports.getNotesDownloader = async (req, res) => {
    try {
        let downloads = await Download.find({ downloaded_by: req.params.id }).lean();

        if (!downloads || downloads.length === 0) {
            return res.status(404).json({ error: 'No downloads found for this user' });
        }

        // Populate downloads
        for (let i = 0; i < downloads.length; i++) {
            downloads[i] = await populateDownload(downloads[i]);
        }
        res.status(200).json(downloads);
    } catch (error) {
        console.log('Error getting downloads by user:', error.message);
        handleError(res, error);
    }
};

exports.getCreatorDownloads = async (req, res) => {
    try {
        let downloads = await Download.find().lean();
        if (!downloads || downloads.length === 0) {
            return res.status(404).json({ error: 'No downloads found for this course' });
        }

        // Populate downloads
        for (let i = 0; i < downloads.length; i++) {
            downloads[i] = await populateDownload(downloads[i]);
        }

        // Get downloads by creator: i.e notes.uploaded_by
        downloads = downloads.filter(download => download.notes.uploaded_by === req.params.id);
        res.status(200).json(downloads);
    } catch (error) {
        console.log('Error getting downloads by course:', error.message);
        handleError(res, error);
    }
};

exports.createDownload = async (req, res) => {
    try {
        const { notes, chapter, course, courseCategory, downloaded_by } = req.body;
        var now = new Date();

        // Validation
        validateRequiredFields([
            { name: 'notes', value: notes },
            { name: 'chapter', value: chapter },
            { name: 'course', value: course },
            { name: 'courseCategory', value: courseCategory },
            { name: 'downloaded_by', value: downloaded_by }
        ]);

        const recentDownExist = await Download.find({ downloaded_by }, {}, { sort: { 'createdAt': -1 } });

        if (recentDownExist.length > 0) {
            let downDate = new Date(recentDownExist[0].createdAt);
            let seconds = Math.round((now - downDate) / 1000);

            if (seconds < 5) {
                return res.status(400).json({
                    message: 'Download with same time saved already!'
                });
            }
        }

        const newDownload = new Download({
            notes,
            chapter,
            course,
            courseCategory,
            downloaded_by
        });

        const savedDownload = await newDownload.save();
        if (!savedDownload) {
            return res.status(400).json({ error: 'Something went wrong during creation!' });
        }

        res.status(200).json({
            _id: savedDownload._id,
            notes: savedDownload.notes,
            chapter: savedDownload.chapter,
            course: savedDownload.course,
            courseCategory: savedDownload.course,
            downloaded_by: savedDownload.downloaded_by
        });
    } catch (error) {
        console.log('Error creating download:', error.message);
        res.status(500).json({ error: 'Failed to create download.' });
    }
};

exports.deleteDownload = async (req, res) => {
    try {
        const download = await Download.findById(req.params.id);
        if (!download) {
            return res.status(404).json({ error: 'Download not found!' });
        }

        const removedDownload = await Download.deleteOne({ _id: req.params.id });
        if (removedDownload.deletedCount === 0) {
            return res.status(400).json({ error: 'Something went wrong while deleting!' });
        }

        res.status(200).json({ message: "Deleted successfully!" });
    } catch (error) {
        console.log('Error deleting download:', error.message);
        res.status(500).json({ error: 'Failed to delete download' });
    }
};

// Get top users by download activity (for statistics service)
exports.getTop10Downloaders = async (req, res) => {
    try {
        // Get top downloaders aggregation
        let topDownloaders = await Download.aggregate([
            { $group: { _id: "$downloaded_by", totalDownloads: { $sum: 1 } } },
            { $sort: { totalDownloads: -1 } },
            { $limit: 10 }
        ]);

        if (topDownloaders.length > 0) {

            const userIds = topDownloaders.map(u => u?._id?.toString());
            const users = await axios.post(`${process.env.USERS_SERVICE_URL}/api/users/batch`, { userIds }, { timeout: 20000, });

            topDownloaders = topDownloaders.map(usr => {
                const user = users?.data?.find(u => u._id === usr?._id?.toString()) || {};
                return {
                    _id: usr._id,
                    name: user.name || 'Unknown User',
                    email: user.email || '',
                    totalDownloads: usr.totalDownloads
                };
            });
        }

        res.status(200).json(topDownloaders);
    } catch (error) {
        console.log('Error getting top downloaders:', error.message);
        res.status(500).json({ error: 'Failed to get top downloaders' });
    }
};

exports.getTop10Notes = async (req, res) => {
    const cacheKey = 'top_10_notes';
    try {
        // Check cache first
        let topNotes = getCachedData(cacheKey);

        if (!topNotes || topNotes.length === 0) {

            const topNotesData = await Download.aggregate([
                { $group: { _id: "$notes", totalDownloaded: { $sum: 1 } } },
                { $sort: { totalDownloaded: -1 } },
                { $limit: 10 }
            ]).exec();

            if (topNotesData.length > 0) {

                const noteIds = topNotesData.map(note => note?._id?.toString());
                const notes = await axios.post(`${process.env.COURSES_SERVICE_URL}/api/notes/batch`, { noteIds }, { timeout: 20000, });

                topNotes = topNotesData.map(nt => {
                    const note = notes?.data?.find(data => String(data._id) === String(nt._id)) || {};
                    return {
                        _id: nt._id,
                        title: note.title || 'Unknown Note',
                        category: note.category || 'Uncategorized',
                        slug: note.slug || '',
                        totalDownloaded: nt.totalDownloaded
                    };
                });
                setCachedData(cacheKey, topNotes);
            }
        }
        res.json(topNotes);
    } catch (error) {
        console.log('\n\nError retrieving top notes:', error);
        handleError(res, error);
    }
}


// Get database statistics for downloads service
exports.getDatabaseStats = async (req, res) => {
    try {
        const db = Download.db;
        const collection = db.collection('downloads');

        // Get document count and estimate sizes using sampling approach
        const documentCount = await collection.countDocuments();
        const sampleDocs = await collection.find({}).limit(50).toArray();
        const avgDocSize = sampleDocs.length > 0 ?
            sampleDocs.reduce((sum, doc) => sum + JSON.stringify(doc).length, 0) / sampleDocs.length : 0;
        const estimatedDataSize = documentCount * avgDocSize;
        const estimatedStorageSize = Math.round(estimatedDataSize * 1.2);
        const estimatedIndexSize = Math.round(estimatedDataSize * 0.1);

        // Get additional aggregated data
        const pipeline = [
            {
                $group: {
                    _id: null,
                    totalDownloads: { $sum: 1 },
                    recentDownloads: {
                        $sum: {
                            $cond: [
                                { $gte: ["$createdAt", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] },
                                1,
                                0
                            ]
                        }
                    },
                    uniqueUsers: { $addToSet: "$downloaded_by" },
                    uniqueNotes: { $addToSet: "$notes" }
                }
            },
            {
                $project: {
                    totalDownloads: 1,
                    recentDownloads: 1,
                    uniqueUsersCount: { $size: "$uniqueUsers" },
                    uniqueNotesCount: { $size: "$uniqueNotes" }
                }
            }
        ];

        const aggregatedStats = await collection.aggregate(pipeline).toArray();
        const downloadStats = aggregatedStats[0] || {};

        const dbStats = {
            service: 'downloads',
            timestamp: new Date().toISOString(),
            documents: documentCount,
            totalDocuments: documentCount,
            dataSize: estimatedDataSize,
            totalDataSize: estimatedDataSize,
            storageSize: estimatedStorageSize,
            totalStorageSize: estimatedStorageSize,
            indexSize: estimatedIndexSize,
            totalIndexSize: estimatedIndexSize,
            avgDocumentSize: avgDocSize,
            collections: {
                downloads: {
                    documents: documentCount,
                    dataSize: estimatedDataSize,
                    avgDocumentSize: avgDocSize
                }
            },
            downloadMetrics: {
                totalDownloads: downloadStats.totalDownloads || 0,
                recentDownloads: downloadStats.recentDownloads || 0,
                uniqueUsers: downloadStats.uniqueUsersCount || 0,
                uniqueNotes: downloadStats.uniqueNotesCount || 0
            }
        };

        res.status(200).json(dbStats);
    } catch (error) {
        console.log('Error getting database stats:', error.message);
        res.status(500).json({ error: 'Failed to get database statistics' });
    }
};
