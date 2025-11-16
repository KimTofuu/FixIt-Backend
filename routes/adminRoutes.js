const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const isAdmin = require('../middleware/isAdmin');

// User management routes
router.get('/users', isAdmin, adminController.getAllUsers);
router.get('/users/suspended', isAdmin, adminController.getSuspendedUsers); // New route
router.get('/users/stats', isAdmin, adminController.getUserStats);
router.get('/users/:userId', isAdmin, adminController.getUserById);
router.patch('/users/:userId/suspend', isAdmin, adminController.suspendUser);
router.patch('/users/:userId/unsuspend', isAdmin, adminController.unsuspendUser);

module.exports = router;