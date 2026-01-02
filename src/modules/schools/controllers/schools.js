const { getModels } = require('../../../utils/db-manager');
const { handleError } = require('../../../utils/error');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "skl:all",
    ONE: (id) => `skl:${id}`,
};

exports.getSchools = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ALL;
        const { School } = await getModels('schools');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await School.find().sort({ createdAt: -1 });
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneSchool = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id);
        const { School } = await getModels('schools');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await School.findById(req.params.id).select('_id title');
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createSchool = async (req, res) => {
    try {
        const { title, location, website } = req.body;
        validateRequiredFields([{ name: 'title', value: title }]);
        const { School } = await getModels('schools');

        // Check if school with same title exists
        const existingSchool = await School.findOne({ title });
        if (existingSchool) throw { 'message': 'School already exists!', 'status': 400 };

        const newSchool = new School({ title, location, website });
        const savedSchool = await newSchool.save();
        if (!savedSchool) throw { 'message': 'Something went wrong during creation!', 'status': 500 };
        await cacheManager.invalidatePattern("skl:*");
        res.status(201).json(savedSchool);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateSchool = async (req, res) => {
    try {
        const { School } = await getModels('schools');

        const updatedSchool = await School.findByIdAndUpdate(req.params.id, req.body, { new: true });
        await cacheManager.invalidatePattern("skl:*");
        res.status(200).json(updatedSchool);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteSchool = async (req, res) => {
    try {
        const { School, Level, Faculty } = await getModels('schools');

        const school = await School.findById(req.params.id);
        if (!school) throw { 'status': 404, 'message': 'School not found!' };

        // Delete levels and faculties belonging to this School
        await Level.deleteMany({ school: school._id });
        await Faculty.deleteMany({ school: school._id });

        // Delete this school
        const removedSchool = await school.deleteOne();
        if (removedSchool.deletedCount === 0) throw { 'status': 503, 'message': 'Something went wrong while deleting!' };
        await cacheManager.invalidatePattern("skl:*");
        res.status(200).json(school);
    } catch (err) {
        handleError(res, err);
    }
};
