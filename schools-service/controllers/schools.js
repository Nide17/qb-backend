const School = require('../models/School');
const Level = require('../models/Level');
const Faculty = require('../models/Faculty');
const { handleError } = require('../utils/error');
const { validateRequiredFields } = require('../utils/helpers');

exports.getSchools = async (req, res) => {
    try {
        const schools = await School.find();
        res.status(200).json(schools);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneSchool = async (req, res) => {
    try {
        let school = await School.findById(req.params.id).select('_id title');
        if (!school) throw { 'statusCode': 404, 'message': 'School not found!' };
        res.status(200).json(school);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createSchool = async (req, res) => {
    try {

        const { title, location, website } = req.body;

        // Validation
        validateRequiredFields([{ name: 'title', value: title }]);

        // Check if school with same title exists
        const existingSchool = await School.findOne({ title });
        if (existingSchool) throw { 'message': 'School already exists!', 'statusCode': 400 };

        const newSchool = new School({ title, location, website });
        const savedSchool = await newSchool.save();
        if (!savedSchool) throw { 'message': 'Something went wrong during creation!', 'statusCode': 500 };

        res.status(200).json({
            _id: savedSchool._id,
            title: savedSchool.title,
            location: savedSchool.location,
            createdAt: savedSchool.createdAt,
            website: savedSchool.website
        });
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateSchool = async (req, res) => {
    try {
        const updatedSchool = await School.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedSchool);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteSchool = async (req, res) => {
    try {
        const school = await School.findById(req.params.id);
        if (!school) throw { 'statusCode': 404, 'message': 'School not found!' };

        // Delete levels and faculties belonging to this School
        await Level.deleteMany({ school: school._id });
        await Faculty.deleteMany({ school: school._id });

        // Delete this school
        const removedSchool = await school.deleteOne();
        if (removedSchool.deletedCount === 0) throw { 'statusCode': 503, 'message': 'Something went wrong while deleting!' };

        res.status(200).json(school);
    } catch (err) {
        handleError(res, err);
    }
};
