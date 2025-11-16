const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken, isAdmin } = require('../middleware/authenticateToken');
const { upload } = require('../config/cloudinary'); // ✅ Must import Cloudinary upload
const reputationController = require('../controllers/reputationController'); // Import reputation controller


// --- ADMIN ROUTES  ---
router.get('/summarize', authenticateToken, isAdmin, reportController.getSummary); // ✅ Add this new route
router.get('/admin/flagged-reports', authenticateToken, isAdmin, reportController.getFlaggedReports);
router.get('/admin/reports-for-approval', authenticateToken, isAdmin, reportController.getReportsForApproval);
router.get('/admin/resolved-reports', authenticateToken, isAdmin, reportController.getResolvedReports);

router.patch('/admin/reports/:id/approve', authenticateToken, isAdmin, reportController.approveReport);
router.patch('/admin/reports/:id/status', authenticateToken, isAdmin, reportController.updateReportStatus);

router.delete('/admin/reports/:id/reject', authenticateToken, isAdmin, reportController.rejectReport);
router.delete('/admin/:reportId/dismiss-flag', authenticateToken, isAdmin, reportController.dismissFlag);
router.delete('/admin/:reportId/dismiss-all-flags', authenticateToken, isAdmin, reportController.dismissAllFlags);

// --- USER ROUTES ---
router.get('/', reportController.getAllReports);
router.post('/', authenticateToken, upload.array('images', 5), reportController.createReport); // ✅ Changed to array
router.get('/getAllReports', reportController.getAllReports);
router.get('/getAllPendingReports', reportController.getAllPendingReports);
router.get('/getAllInProgressReports', reportController.getAllInProgressReports);
router.get('/getAllResolvedReports', reportController.getAllResolvedReports);

// new endpoints used by frontend
router.get('/resolvedReports', reportController.getResolvedReports);
router.get('/resolvedReports/count', reportController.getResolvedReportsCount);

router.post('/getReport', reportController.getReport);
router.post('/getReportByUser', reportController.getReportByUser);
router.get('/my', authenticateToken, reportController.getMyReports);
router.post('/:id/comment', authenticateToken, reportController.addComment);
router.patch('/:id/comment/:commentId', authenticateToken, reportController.updateComment);
router.delete('/:id/comment/:commentId', authenticateToken, reportController.deleteComment);
router.delete('/:id', authenticateToken, reportController.deleteReport);
router.patch('/:id', authenticateToken, upload.array('images', 5), reportController.updateReport); // ✅ Changed to array

router.post('/:reportId/flag', authenticateToken, reportController.flagReport);
router.post('/:reportId/vote-helpful', authenticateToken, reputationController.voteHelpful); // Add this line

module.exports = router;