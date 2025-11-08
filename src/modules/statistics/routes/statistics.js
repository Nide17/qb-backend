const express = require('express');
const { get50NewUsers, getAllUsers, getUsersWithImage, getUsersWithSchool, getUsersWithLevel, getUsersWithFaculty, getUsersWithInterests, getUsersWithAbout, getTop10QuizzingUsers, getTop10Downloaders, getTop10Quizzes, getTop10Notes, getDailyUserRegistration, getDashboardStats, updateDashboardStats, getLiveAnalytics, clearStatsCache, getSystemMetrics } = require('../controllers/statistics');
const { authRole } = require('../../../middlewares/auth.js');

const router = express.Router();

router.get('/all-users', authRole(['Admin', 'SuperAdmin']), getAllUsers);
router.get('/50-new-users', authRole(['Admin', 'SuperAdmin']), get50NewUsers);
router.get('/users-with-image', authRole(['Admin', 'SuperAdmin']), getUsersWithImage);
router.get('/users-with-school', authRole(['Admin', 'SuperAdmin']), getUsersWithSchool);
router.get('/users-with-level', authRole(['Admin', 'SuperAdmin']), getUsersWithLevel);
router.get('/users-with-faculty', authRole(['Admin', 'SuperAdmin']), getUsersWithFaculty);
router.get('/users-with-interests', authRole(['Admin', 'SuperAdmin']), getUsersWithInterests);
router.get('/users-with-about', authRole(['Admin', 'SuperAdmin']), getUsersWithAbout);
router.get('/top-10-quizzing-users', getTop10QuizzingUsers);
router.get('/top-10-quizzes', authRole(['Admin', 'SuperAdmin']), getTop10Quizzes);
router.get('/top-10-downloaders', authRole(['Admin', 'SuperAdmin']), getTop10Downloaders);
router.get('/top-10-notes', authRole(['Admin', 'SuperAdmin']), getTop10Notes);
router.get('/daily-user-registration', authRole(['Admin', 'SuperAdmin']), getDailyUserRegistration);

// New enhanced endpoints
router.get('/dashboard-stats', getDashboardStats);
router.post('/update-dashboard-stats', authRole(['Admin', 'SuperAdmin']), updateDashboardStats);
router.get('/live-analytics', authRole(['Admin', 'SuperAdmin']), getLiveAnalytics);
router.delete('/clear-cache', authRole(['SuperAdmin']), clearStatsCache);

// System endpoints
router.get('/system-metrics', authRole(['Admin', 'SuperAdmin']), getSystemMetrics);

module.exports = router;