const Faculty = require('../models/Faculty');
const { handleError } = require('../utils/error');
const { validateRequiredFields } = require('../utils/helpers');

exports.getFaculties = async (req, res) => {

    try {
        const faculties = await Faculty.find().sort({ createdAt: -1 }).populate('school level', 'title');
        res.status(200).json(faculties);
    } catch (err) {
        handleError(res, err);
    }

};

exports.getFacultiesByLevel = async (req, res) => {
    try {
        const faculties = await Faculty.find({ level: req.params.id }).sort({ createdAt: -1 }).populate('school level', 'title');
        res.status(200).json(faculties);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneFaculty = async (req, res) => {
    try {
        const faculty = await Faculty.findById(req.params.id).populate('school level', 'title school level');

    if (!faculty) throw {'statusCode':404,'message':'Faculty not found!'};
        res.status(200).json(faculty);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createFaculty = async (req, res) => {

    try {
        // Validation
        const { title, school, level, years } = req.body;
        validateRequiredFields([{ name: 'title', value: title }, { name: 'school', value: school }, { name: 'level', value: level }]);

        // Check if faculty with same title exists in the same school level
        const faculty = await Faculty.findOne({ title, school, level });
    if (faculty) throw {'statusCode':403,'message':'Faculty already exists in this school level!'};

        const newFaculty = new Faculty({
            title,
            school,
            level,
            years
        });

        const savedFaculty = await newFaculty.save();
    if (!savedFaculty) throw {'statusCode':503,'message':'Something went wrong during creation!'};

        res.status(200).json({
            _id: savedFaculty._id,
            title: savedFaculty.title,
            school: savedFaculty.school,
            level: savedFaculty.level,
            years: savedFaculty.level,
            createdAt: savedFaculty.createdAt
        });
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateFaculty = async (req, res) => {
    try {
        const faculty = await Faculty.findById(req.params.id);
    if (!faculty) throw {'statusCode':404,'message':'Faculty not found!'};

        const updatedFaculty = await Faculty.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedFaculty);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteFaculty = async (req, res) => {
    try {
        const faculty = await Faculty.findById(req.params.id);
    if (!faculty) throw {'statusCode':404,'message':'Faculty not found!'};

        const removedFaculty = await faculty.deleteOne();
    if (removedFaculty.deletedCount === 0) throw {'statusCode':503,'message':'Something went wrong while deleting!'};

        res.status(200).json(faculty);
    } catch (err) {
        handleError(res, err);
    }
};
