const { handleError } = require('../../../utils/error');
const { cacheManager, cacheWrapper } = require('../../../utils/global-helpers');
const Download = require('../models/Download');
const { expandDownloads } = require('../helpers');
const User = require('../../users/models/User');
const Notes = require('../../courses/models/Notes');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "dwd:all",
    ONE: (id) => `dwd:${id}`,
    PAGINATED: (pageNo) => `dwd:page:${pageNo}`,
    LIMITED: (limit, skip) => `dwd:limited:${limit}:${skip}`,
    BY_DOWNLOADER: (downloader) => `dwd:downloader:${downloader}`,
    BY_CREATOR: (creator) => `dwd:creator:${creator}`,
    DB_STATS: "dwd:db_stats"
};
exports.getDownloads = async (req, res) => {

    try {
        // Pagination - ENFORCE pagination to prevent memory exhaustion
        const totalDownloads = await Download.countDocuments({});
        var PAGE_SIZE = 20;
        var pageNo = parseInt(req.query.pageNo || '1');
        var query = {};

        query.limit = PAGE_SIZE;
        query.skip = PAGE_SIZE * (pageNo - 1);

        // Return stats only if requested
        if (req.query?.filter === 'stats') return res.status(200).json(totalDownloads);

        // Always use pagination to prevent memory exhaustion
        if (pageNo && pageNo > 0) {
            const cacheKey = CACHE_KEYS.PAGINATED(pageNo);

            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
                let downloads = await Download.find({}, {}, query).sort({ createdAt: -1 }).lean();
                if (!downloads || downloads.length === 0) throw { 'message': 'No downloads found!', 'status': 404 };

                // Expand downloads
                const expandedDownloads = await expandDownloads(downloads);
                const result = {
                    totalPages: Math.ceil(totalDownloads / PAGE_SIZE),
                    page: pageNo,
                    pageSize: PAGE_SIZE,
                    totalDownloads,
                    downloads: expandedDownloads || downloads
                }
                return result;
            })
            return res.status(200).json(data);
        }
        else if (req.query?.limit && req.query?.skip) {
            const cacheKey = CACHE_KEYS.LIMITED(req.query.limit, req.query.skip);
            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
                let downloads = await Download.find({}, {}, query).sort({ createdAt: -1 }).lean();
                if (!downloads || downloads.length === 0) throw { 'message': 'No downloads found!', 'status': 404 };

                // Expand downloads
                const expandedDownloads = await expandDownloads(downloads);
                return expandedDownloads || downloads;
            })
            return res.status(200).json(data);
        }
        else {
            const cacheKey = CACHE_KEYS.ALL;
            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
                const downloads = await Download.find().sort({ createdAt: -1 }).lean();
                return downloads;
            })
            return res.status(200).json(data);
        }
    } catch (err) {
        console.log('Error getting downloads:', err.message);
        handleError(res, err);
    }
};

exports.getOneDownload = async (req, res) => {
    try {

        const cacheKey = CACHE_KEYS.ONE(req.params.id);
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let download = await Download.findById(req.params.id).lean();
            if (!download) throw { 'message': 'Download not found!', 'status': 404 };

            if (download?.downloaded_by) {
                const user = await User.findById(download.downloaded_by).select('_id name email');
                download.downloaded_by = user || { _id: download.downloaded_by, name: 'Unknown User' };
            }
            if (download?.notes) {
                const note = await Notes
                    .findById(download.notes)
                    .populate('course', '_id title')
                    .populate('courseCategory', '_id title')
                    .select('_id title')
                    .lean();
                download.notes = { _id: note._id || download.notes, title: note.title || 'Unknown Note' };
                download.chapter = note ? note.chapter : null;
                download.course = note ? note.course : null;
                download.courseCategory = note ? note.courseCategory : null;
            }

            return download;
        })

        return res.status(200).json(data);
    } catch (err) {
        console.log('Error getting download:', err.message);
        handleError(res, err);
    }
};

exports.getDownloadsByUser = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.BY_DOWNLOADER(req.params.id);

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let downloads = await Download.find({ downloaded_by: req.params.id }).lean();

            if (!downloads || downloads.length === 0) throw { 'message': 'No downloads found for this user', 'status': 404 };

            // Expand downloads
            const expandedDownloads = await expandDownloads(downloads);
            downloads = expandedDownloads || downloads;
            return downloads;
        })
        return res.status(200).json(data);

    } catch (err) {
        console.log('Error getting downloads by user:', err.message);
        handleError(res, err);
    }
};

exports.getDownloadsByCreator = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.BY_CREATOR(req.params.id);

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let downloads = await Download.find().lean();
            if (!downloads || downloads.length === 0) throw { 'message': 'No downloads found for this course', 'status': 404 };

            // Expand downloads
            const expandedDownloads = await expandDownloads(downloads);
            downloads = expandedDownloads || downloads;

            // Get downloads by creator: i.e notes.uploaded_by
            downloads = downloads.filter(download => download.notes.uploaded_by === req.params.id);
            return downloads;
        })
        return res.status(200).json(data);
    } catch (err) {
        console.log('Error getting downloads by course:', err.message);
        handleError(res, err);
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

            if (seconds < 5) throw { 'message': 'Download with same time saved already!', 'status': 400 };
        }

        const newDownload = new Download({
            notes,
            chapter,
            course,
            courseCategory,
            downloaded_by
        });

        const savedDownload = await newDownload.save();
        if (!savedDownload) throw { 'message': 'Something went wrong during creation!', 'status': 400 };
        await cacheManager.invalidatePattern("dwd:*");
        res.status(200).json(savedDownload);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteDownload = async (req, res) => {
    try {
        const download = await Download.findById(req.params.id);
        if (!download) throw { message: 'Download not found!', status: 404 };

        const removedDownload = await Download.deleteOne({ _id: req.params.id });
        if (removedDownload.deletedCount === 0) throw { message: 'Something went wrong while deleting!', status: 500 };
        await cacheManager.invalidatePattern("dwd:*");
        res.status(200).json(download);
    } catch (err) {
        handleError(res, err);
    }
};

// Get database statistics for downloads service
exports.getDatabaseStats = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.DB_STATS;

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
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
                                    { $gte: ['$createdAt', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] },
                                    1,
                                    0
                                ]
                            }
                        },
                        uniqueUsers: { $addToSet: '$downloaded_by' },
                        uniqueNotes: { $addToSet: '$notes' }
                    }
                },
                {
                    $project: {
                        totalDownloads: 1,
                        recentDownloads: 1,
                        uniqueUsersCount: { $size: '$uniqueUsers' },
                        uniqueNotesCount: { $size: '$uniqueNotes' }
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

            return dbStats;
        });
        res.status(200).json(data);
    } catch (err) {
        console.log('Error getting database stats:', err.message);
        throw { 'message': 'Failed to get database statistics', 'status': 500 };
    }
};
