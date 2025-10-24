const Level = require('../models/Level');
const Faculty = require('../models/Faculty');
const { handleError } = require('../utils/error');
const { validateRequiredFields } = require('../utils/helpers');

exports.getLevels = async (req, res) => {

    try {
        const levels = await Level.find().sort({ createdAt: -1 }).populate('school', 'title');
        res.status(200).json(levels);
    } catch (err) {
        handleError(res, err);
    }

};

exports.getLevelsBySchool = async (req, res) => {
    try {
        const levels = await Level.find({ school: req.params.id }).sort({ createdAt: -1 }).populate('school', 'title');
        res.status(200).json(levels);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneLevel = async (req, res) => {
    try {
        const level = await Level.findById(req.params.id).populate('school', 'title');

    if (!level) throw {'statusCode':404,'message':'Level not found!'};
    res.status(200).json(level);
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
    if (level) throw {'statusCode':403,'message':'This level already exists in this school!'};
        const newLevel = new Level({
            title,
            school
        });

    const savedLevel = await newLevel.save();
    if (!savedLevel) throw {'statusCode':503,'message':'Something went wrong during creation!'};

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
    if (!level) throw {'statusCode':404,'message':'Level not found!'};

    const updatedLevel = await Level.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.status(200).json(updatedLevel);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteLevel = async (req, res) => {
    try {
        const level = await Level.findById(req.params.id);
        if (!level) throw {'statusCode':404,'message':'Level not found!'};

        // Delete faculties belonging to this level
        const remFaculty = await Faculty.deleteMany({ level: req.params.id });

        if (!remFaculty)
            throw {'statusCode':503,'message':'Something went wrong while deleting!'};

        // Delete level
        const removedLevel = await level.deleteOne();

        if (removedLevel.deletedCount === 0)
            throw {'statusCode':503,'message':'Something went wrong while deleting!'};

        res.status(200).json(level);
    } catch (err) {
        handleError(res, err);
    }
};
