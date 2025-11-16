const Level = require('../models/Level');
const Faculty = require('../models/Faculty');
const { handleError } = require('../../../utils/error');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "lvl:all",
    ONE: (id) => `lvl:${id}`,
    BY_SCHOOL: (id) => `lvl:skl:${id}`
};

exports.getLevels = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.ALL;
        const data = await cacheWrapper(cacheManager, cacheKey, CACHE_TTL, async () => {
            return await Level.find().sort({ createdAt: -1 }).populate('school', 'title');
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }

};

exports.getLevelsBySchool = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.BY_SCHOOL(req.params.id);
        const data = await cacheWrapper(cacheManager, cacheKey, CACHE_TTL, async () => {
            return await Level.find({ school: req.params.id }).sort({ createdAt: -1 }).populate('school', 'title');
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneLevel = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id)
        const data = await cacheWrapper(cacheManager, cacheKey, CACHE_TTL, async () => {
            return await Level.findById(req.params.id).populate('school', 'title');
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createLevel = async (req, res) => {

    const { title, school } = req.body;

    try {
        // Validation
        validateRequiredFields([{ name: 'title', value: title }, { name: 'school', value: school }]);

        // Check if level with same title exists in the same school
        const level = await Level.findOne({ title, school });
        if (level) throw { 'status': 403, 'message': 'This level already exists in this school!' };
        const newLevel = new Level({
            title,
            school
        });

        const savedLevel = await newLevel.save();
        if (!savedLevel) throw { 'status': 503, 'message': 'Something went wrong during creation!' };
        await cacheManager.invalidatePattern("lvl:*");
        res.status(200).json({
            _id: savedLevel._id,
            title: savedLevel.title,
            school: savedLevel.school,
            createdAt: savedLevel.createdAt,
        });
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateLevel = async (req, res) => {
    try {
        const level = await Level.findById(req.params.id);
        if (!level) throw { 'status': 404, 'message': 'Level not found!' };

        const updatedLevel = await Level.findByIdAndUpdate(req.params.id, req.body, { new: true });
        await cacheManager.invalidatePattern("lvl:*");
        res.status(200).json(updatedLevel);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteLevel = async (req, res) => {
    try {
        const level = await Level.findById(req.params.id);
        if (!level) throw { 'status': 404, 'message': 'Level not found!' };

        // Delete faculties belonging to this level
        const remFaculty = await Faculty.deleteMany({ level: req.params.id });

        if (!remFaculty)
            throw { 'status': 503, 'message': 'Something went wrong while deleting!' };

        // Delete level
        const removedLevel = await level.deleteOne();

        if (removedLevel.deletedCount === 0) throw { 'status': 503, 'message': 'Something went wrong while deleting!' };
        await cacheManager.invalidatePattern("lvl:*");
        res.status(200).json(level);
    } catch (err) {
        handleError(res, err);
    }
};
