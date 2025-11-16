const express = require('express');
const router = express.Router();
const reputationController = require('../controllers/reputationController');
const { authenticateToken } = require('../middleware/authenticateToken');

// Get user reputation
router.get('/:userId', reputationController.getUserReputation);

// Get current user reputation
router.get('/me', authenticateToken, reputationController.getUserReputation);

// Vote report as helpful
router.post('/vote/:reportId', authenticateToken, reputationController.voteHelpful);

// Get leaderboard
router.get('/leaderboard', reputationController.getLeaderboard);

module.exports = router;