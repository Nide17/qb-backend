const { getModels } = require('../../../utils/db-manager');
const { handleError } = require('../../../utils/error');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "fct:all",
    ONE: (id) => `fct:${id}`,
    BY_LEVEL: (id) => `fct:lvl:${id}`
};

exports.getFaculties = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.ALL;
        const { Faculty } = await getModels('schools');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await Faculty.find().sort({ createdAt: -1 }).populate('school level', 'title');
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }

};

exports.getFacultiesByLevel = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.BY_LEVEL;
        const { Faculty } = await getModels('schools');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await Faculty.find({ level: req.params.id }).sort({ createdAt: -1 }).populate('school level', 'title');
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneFaculty = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id);
        const { Faculty } = await getModels('schools');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await Faculty.findById(req.params.id).populate('school level', 'title school level');
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createFaculty = async (req, res) => {

    try {
        // Validation
        const { title, school, level, years } = req.body;
        validateRequiredFields([{ name: 'title', value: title }, { name: 'school', value: school }, { name: 'level', value: level }]);
        const { Faculty } = await getModels('schools');

        // Check if faculty with same title exists in the same school level
        const faculty = await Faculty.findOne({ title, school, level });
        if (faculty) throw { 'status': 403, 'message': 'Faculty already exists in this school level!' };

        const newFaculty = new Faculty({
            title,
            school,
            level,
            years
        });

        const savedFaculty = await newFaculty.save();
        if (!savedFaculty) throw { 'status': 503, 'message': 'Something went wrong during creation!' };
        await cacheManager.invalidatePattern("fct:*");
        res.status(200).json(savedFaculty);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateFaculty = async (req, res) => {
    try {
        const { Faculty } = await getModels('schools');

        const faculty = await Faculty.findById(req.params.id);
        if (!faculty) throw { 'status': 404, 'message': 'Faculty not found!' };

        const updatedFaculty = await Faculty.findByIdAndUpdate(req.params.id, req.body, { new: true });
        await cacheManager.invalidatePattern("fct:*");
        res.status(200).json(updatedFaculty);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteFaculty = async (req, res) => {
    try {
        const { Faculty } = await getModels('schools');

        const faculty = await Faculty.findById(req.params.id);
        if (!faculty) throw { 'status': 404, 'message': 'Faculty not found!' };

        const removedFaculty = await faculty.deleteOne();
        if (removedFaculty.deletedCount === 0) throw { 'status': 503, 'message': 'Something went wrong while deleting!' };
        await cacheManager.invalidatePattern("fct:*");
        res.status(200).json(faculty);
    } catch (err) {
        handleError(res, err);
    }
};
