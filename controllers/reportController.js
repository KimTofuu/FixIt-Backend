const mongoose = require('mongoose');
const Report = require('../models/Report');
const User = require('../models/Users');
const ResolvedReport = require('../models/ResolvedReport'); // 1. Add this import
const { cloudinary, upload } = require('../config/cloudinary');
const { sendEmailBrevo } = require('../config/emailConfig'); 
const reputationController = require('./reputationController');

const Bytez = require('bytez.js');
const bytezClient = new Bytez(process.env.BYTEZ_API_KEY);

const resolveMongoIdString = (value) => {
  if (!value && value !== 0) return undefined;

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '[object Object]') return undefined;

    const objectIdMatch = trimmed.match(/^ObjectId\((?:"|')?([0-9a-fA-F]{24})(?:"|')?\)$/);
    if (objectIdMatch) return objectIdMatch[1];

    if (/^[0-9a-fA-F]{24}$/.test(trimmed)) {
      return trimmed;
    }

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return resolveMongoIdString(parsed);
      } catch (err) {
        // ignore JSON parse error and fall through
      }
    }

    return trimmed;
  }

  if (typeof value === 'object' && value !== null) {
    if (typeof value.$oid === 'string') {
      return value.$oid;
    }
    if (typeof value._id === 'string' || value._id instanceof mongoose.Types.ObjectId) {
      return resolveMongoIdString(value._id);
    }
    if (typeof value.id === 'string' || value.id instanceof mongoose.Types.ObjectId) {
      return resolveMongoIdString(value.id);
    }
    if (typeof value.toString === 'function') {
      const asString = value.toString();
      if (asString && asString !== '[object Object]') {
        return resolveMongoIdString(asString);
      }
    }
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  return undefined;
};

const normalizeComments = (comments = []) => {
  return comments.map((comment) => {
    const commentObj = comment?.toObject ? comment.toObject() : { ...comment };
    const normalizedId = resolveMongoIdString(commentObj._id || commentObj.id);
    const normalizedUserId = resolveMongoIdString(commentObj.userId);
    return {
      ...commentObj,
      _id: normalizedId || commentObj._id,
      id: normalizedId || commentObj.id,
      userId: normalizedUserId || commentObj.userId,
    };
  });
};

const findCommentById = (comments = [], rawCommentId) => {
  const normalizedCommentId = resolveMongoIdString(rawCommentId);
  if (!normalizedCommentId) return null;

  if (mongoose.Types.ObjectId.isValid(normalizedCommentId)) {
    const byObjectId = comments.id(normalizedCommentId);
    if (byObjectId) {
      return byObjectId;
    }
  }

  return (
    comments.find((comment) => {
      const candidates = [comment?._id, comment?.id];
      return candidates.some((candidate) => resolveMongoIdString(candidate) === normalizedCommentId);
    }) || null
  );
};

// Helper function to format reports with string IDs
const formatReportsWithStringIds = (reports) => {
  return reports.map(report => {
    const reportObj = report.toObject ? report.toObject() : report;
    return {
      ...reportObj,
      votedBy: (reportObj.votedBy || []).map(id => id.toString()),
      user: reportObj.user ? {
        ...reportObj.user,
        _id: reportObj.user._id ? reportObj.user._id.toString() : undefined
      } : null
    };
  });
};

// ✅ Update multer configuration to handle multiple files
const uploadMultiple = upload.array('images', 5); // Max 5 images

// Create a new report
exports.createReport = async (req, res) => {
  try {
    const { title, description, category, location, latitude, longitude, isUrgent } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ✅ Handle multiple image uploads
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      imageUrls = req.files.map(file => file.path);
      
      console.log('📸 Multiple images uploaded:', {
        count: imageUrls.length,
        urls: imageUrls
      });
    }

    const isUrgentBool = isUrgent === 'true' || isUrgent === true;
    const initialStatus = isUrgentBool ? 'pending' : 'awaiting-approval';

    const newReport = new Report({
      title,
      description,
      images: imageUrls, // ✅ Store array of images
      image: imageUrls[0] || null, // ✅ Keep first image for backward compatibility
      location,
      latitude,
      longitude,
      category,
      isUrgent: isUrgentBool,
      status: initialStatus,
      user: userId,
    });

    await newReport.save();
    
    console.log('✅ Report saved with images:', {
      id: newReport._id,
      imageCount: imageUrls.length,
      images: newReport.images
    });

    // Send email
    try {
      await sendEmailBrevo(
        user.email,  // ✅ First parameter: email string
        `Report Submitted: ${title}`,  // ✅ Second parameter: subject
        `
          <div style="font-family: Arial, sans-serif;">
            <h2>Report Received! 🎉</h2>
            <p>Hi ${user.fName},</p>
            <p>Your report has been submitted successfully.</p>
          </div>
        `  // ✅ Third parameter: HTML content
      );
    } catch (emailError) {
      console.error('❌ Email error:', emailError);
    }

    // Award reputation points
    user.reputation.points = (user.reputation.points || 0) + 10;
    user.reputation.totalReports = (user.reputation.totalReports || 0) + 1;
    await user.checkAndAwardBadges();
    await user.save();

    const populatedReport = await Report.findById(newReport._id).populate('user', 'fName lName email profilePicture');

    res.status(201).json({ 
      message: 'Report created successfully', 
      report: populatedReport
    });
  } catch (err) {
    console.error('❌ Create report error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update report status (for admins)
exports.updateReportStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const reportId = req.params.id;

    // Handle non-resolved status updates normally
    if (status !== 'resolved') {
      if (!['pending', 'in-progress'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status value' });
      }
      const report = await Report.findByIdAndUpdate(
        reportId,
        { status },
        { new: true }
      ).populate('user', 'fName lName email profilePicture reputation');

      if (!report) {
        return res.status(404).json({ message: 'Report not found' });
      }
      return res.json(report);
    }

    // --- Handle 'resolved' status: Move the report ---
    console.log(`📦 Attempting to resolve and move report ID: ${reportId}`);
    
    // Find the original report
    const originalReport = await Report.findById(reportId).lean();
    if (!originalReport) {
      return res.status(404).json({ message: 'Original report not found to resolve' });
    }

    console.log('📄 Original report found:', {
      id: originalReport._id,
      title: originalReport.title,
      category: originalReport.category,
      user: originalReport.user,
      hasImages: originalReport.images?.length || 0,
      hasVideos: originalReport.videos?.length || 0,
      hasComments: originalReport.comments?.length || 0
    });

    // Create a new ResolvedReport document with ALL necessary fields
    const resolvedReportData = {
      originalReportId: originalReport._id,
      title: originalReport.title,
      description: originalReport.description,
      category: originalReport.category, // ADDED
      image: originalReport.image || (originalReport.images?.[0]) || null,
      images: originalReport.images || [], // ADDED
      videos: originalReport.videos || [], // ADDED
      location: originalReport.location,
      latitude: originalReport.latitude || null,
      longitude: originalReport.longitude || null,
      isUrgent: originalReport.isUrgent || false, // ADDED
      user: originalReport.user,
      comments: (originalReport.comments || []).map(c => ({
        userId: c.userId,
        user: c.user || c.author || 'Unknown',
        fName: c.fName || '',
        lName: c.lName || '',
        email: c.email || '',
        barangay: c.barangay || '',
        municipality: c.municipality || '',
        profilePicture: c.profilePicture || '',
        text: c.text || '',
        createdAt: c.createdAt || new Date()
      })),
      createdAt: originalReport.createdAt || new Date(),
      updatedAt: originalReport.updatedAt || new Date(), // ADDED
      resolvedAt: new Date(),
    };

    console.log('💾 Creating ResolvedReport with data:', {
      originalReportId: resolvedReportData.originalReportId,
      title: resolvedReportData.title,
      category: resolvedReportData.category,
      user: resolvedReportData.user,
      imagesCount: resolvedReportData.images.length,
      videosCount: resolvedReportData.videos.length,
      commentsCount: resolvedReportData.comments.length
    });

    const newResolvedReport = new ResolvedReport(resolvedReportData);
    
    // Save the new ResolvedReport
    await newResolvedReport.save();
    console.log(`✅ Report ${reportId} successfully saved to ResolvedReport collection.`);

    // Delete the original report from the main collection
    await Report.findByIdAndDelete(reportId);
    console.log(`✅ Original report ${reportId} deleted from Report collection.`);

    // Award reputation points to the user who reported it
    if (reputationController?.awardResolvedReport) {
      try {
        await reputationController.awardResolvedReport(originalReport.user);
        console.log('✅ Reputation awarded for resolved report');
      } catch (repError) {
        console.error('❌ Reputation award error:', repError);
      }
    }

    // Populate the user field before returning
    const populatedReport = await ResolvedReport.findById(newResolvedReport._id)
      .populate('user', 'fName lName email profilePicture reputation');

    console.log('🎉 Report successfully resolved and archived!');

    // Return a success response
    res.json({
      message: 'Report marked as resolved and archived successfully.',
      resolvedReport: populatedReport,
    });

  } catch (err) {
    console.error('❌ Update status error:', err);
    res.status(500).json({ 
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
};

// When admin verifies a report
exports.verifyReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const userId = req.user?.userId || req.userId; // Fixed
    
    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    report.isVerified = true;
    report.verifiedBy = userId;
    report.verifiedAt = new Date();
    await report.save();
    
    // Award reputation
    try {
      await reputationController.awardVerifiedReport(report.user);
      console.log('✅ Reputation awarded for verified report');
    } catch (repError) {
      console.error('❌ Reputation award error:', repError);
    }
    
    res.json({ message: 'Report verified', report });
  } catch (err) {
    console.error('Verify report error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all reports with user details
exports.getAllReports = async (req, res) => {
  try {
    const reports = await Report.find({ status: { $ne: 'Rejected' } })
      .populate('user', 'fName lName email profilePicture reputation')
      .sort({ createdAt: -1 });

    // Normalize votedBy to always be strings
    const normalizedReports = reports.map(report => {
      const reportObj = report.toObject();
      
      // Ensure votedBy is an array of strings
      if (reportObj.votedBy) {
        reportObj.votedBy = reportObj.votedBy.map(id => id.toString());
      } else {
        reportObj.votedBy = [];
      }
      
      return reportObj;
    });

    res.json(normalizedReports);
  } catch (err) {
    console.error('Get all reports error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all pending reports
exports.getAllPendingReports = async (req, res) => {
  try {
    const reports = await Report.find({ status: 'pending' })
      .select('-__v')
      .populate('user', 'fName lName email reputation');
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all in-progress reports
exports.getAllInProgressReports = async (req, res) => {
  try {
    const reports = await Report.find({ status: 'in-progress' })
      .select('-__v')
      .populate('user', 'fName lName email reputation');
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all resolved reports
exports.getAllResolvedReports = async (req, res) => {
  try {
    const reports = await Report.find({ status: 'resolved' })
      .select('-__v')
      .populate('user', 'fName lName email reputation');
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// return all resolved reports (from ResolvedReport collection)
exports.getResolvedReports = async (req, res) => {
  try {
    const resolved = await ResolvedReport.find().lean();
    return res.json(resolved);
  } catch (err) {
    console.error('getResolvedReport error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// return count of resolved reports (fast)
exports.getResolvedReportsCount = async (req, res) => {
  try {
    const count = await ResolvedReport.countDocuments();
    return res.json({ count });
  } catch (err) {
    console.error('getResolvedReportsCount error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Get a report by ID
exports.getReport = async (req, res) => {
  try {
    const { id } = req.body;
    const report = await Report.findById(id)
      .select('-__v')
      .populate('user', 'fName lName email reputation');
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    res.status(200).json(report);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
    console.error(err);
  }
};

// Get reports by user
exports.getReportByUser = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ message: 'userId is required' });
    }
    const reports = await Report.find({ user: id })
      .select('-__v')
      .populate('user', 'fName lName email reputation');
    if (!reports || reports.length === 0) {
      return res.status(404).json({ message: 'No reports found for this user' });
    }
    res.status(200).json(reports);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
    console.error(err);
  }
};

// Get my reports
exports.getMyReports = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const reports = await Report.find({ user: userId })
      .populate('user', 'fName lName email profilePicture reputation')
      .sort({ createdAt: -1 });
    return res.status(200).json(reports);
  } catch (err) {
    console.error('getMyReports error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.addComment = async (req, res) => {
  try {
    const reportId = req.params.id;
    const { text } = req.body;
    const userId = req.user?.userId || req.userId;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const userDoc = await User.findById(userId);
    if (!userDoc) {
      return res.status(404).json({ message: 'User not found' });
    }

    const comment = {
      userId,
      user: `${userDoc.fName || ''} ${userDoc.lName || ''}`.trim(),
      fName: userDoc.fName || '',
      lName: userDoc.lName || '',
      email: userDoc.email || '',
      barangay: userDoc.barangay || '',
      municipality: userDoc.municipality || '',
      profilePicture: userDoc.profilePicture?.url || '',
      text: text.trim(),
      createdAt: new Date(),
      editedAt: null
    };
    const report = await Report.findByIdAndUpdate(
      reportId,
      { $push: { comments: comment } },
      { new: true }
    );
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    res.status(200).json(normalizeComments(report.comments));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateComment = async (req, res) => {
  try {
    const { id: reportId, commentId } = req.params;
    const { text } = req.body;
    const userId = req.user?.userId || req.userId;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    const comment = findCommentById(report.comments, commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const commentOwnerId = resolveMongoIdString(comment.userId);
    if (!commentOwnerId || commentOwnerId !== String(userId)) {
      return res.status(403).json({ message: 'You can only edit your own comments' });
    }

    comment.text = text.trim();
    comment.editedAt = new Date();

    await report.save();

    const updatedReport = await Report.findById(reportId);

    return res.status(200).json(normalizeComments(updatedReport?.comments || []));
  } catch (err) {
    console.error('updateComment error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const { id: reportId, commentId } = req.params;
    const userId = req.user?.userId || req.userId;

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    const comment = findCommentById(report.comments, commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const commentOwnerId = resolveMongoIdString(comment.userId);
    if (!commentOwnerId || commentOwnerId !== String(userId)) {
      return res.status(403).json({ message: 'You can only delete your own comments' });
    }

    if (typeof comment.remove === 'function') {
      comment.remove();
    } else if (comment._id || comment.id) {
      const targetId = resolveMongoIdString(comment._id || comment.id);
      report.comments = report.comments.filter((current) => {
        const currentId = resolveMongoIdString(current._id || current.id);
        return currentId !== targetId;
      });
    }

    await report.save();

    const updatedReport = await Report.findById(reportId);

    return res.status(200).json(normalizeComments(updatedReport?.comments || []));
  } catch (err) {
    console.error('deleteComment error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteReport = async (req, res) => {
  try {
    const reportId = req.params.id;
    const userId = req.user?.userId || req.userId;
    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    if (report.user.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to delete this report' });
    }
    await Report.findByIdAndDelete(reportId);
    res.status(200).json({ message: 'Report deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
    console.error(err);
  }
};

exports.updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, location, latitude, longitude, isUrgent } = req.body;
    const userId = req.user?.userId;

    const report = await Report.findById(id);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    if (report.user.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to update this report' });
    }

    // ✅ Handle multiple image uploads for update
    if (req.files && req.files.length > 0) {
      const imageUrls = req.files.map(file => file.path);
      report.images = imageUrls;
      report.image = imageUrls[0]; // Keep first image for backward compatibility
    }

    report.title = title || report.title;
    report.description = description || report.description;
    report.category = category || report.category;
    report.location = location || report.location;
    report.latitude = latitude || report.latitude;
    report.longitude = longitude || report.longitude;
    report.isUrgent = isUrgent !== undefined ? (isUrgent === 'true' || isUrgent === true) : report.isUrgent;

    await report.save();

    const populatedReport = await Report.findById(id).populate('user', 'fName lName email profilePicture');

    res.status(200).json({ 
      message: 'Report updated successfully', 
      report: populatedReport 
    });
  } catch (err) {
    console.error('❌ Update report error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getReportsForApproval = async (req, res) => {
  try {
    const reports = await Report.find({ status: 'awaiting-approval' })
      .populate('user', 'fName lName email profilePicture reputation') 
      .sort({ createdAt: -1 });
    res.json(reports);
  } catch (err) {
    console.error('getReportsForApproval error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.approveReport = async (req, res) => {
  try {
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status: 'pending' },
      { new: true }
    ).populate('user', 'fName lName email reputation');
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    try {
      const emailMessage = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Report Approved!</h2>
          <p>Hi ${report.user.fName},</p>
          <p>Great news! Your report has been approved by our administrators and is now publicly visible.</p>
          <h3>Report Details:</h3>
          <ul>
            <li><strong>Report ID:</strong> ${report._id}</li>
            <li><strong>Title:</strong> ${report.title}</li>
            <li><strong>Status:</strong> Pending</li>
          </ul>
          <p>Our team will now review and work on resolving this issue. You will be notified of any updates.</p>
          <p>Thank you for helping improve our community!</p>
        </div>
      `;
      await sendEmailBrevo(
        report.user.email,
        `Your FixItPH Report Has Been Approved (ID: ${report._id})`,
        emailMessage,
      );
      console.log('📧 Approval email sent successfully to:', report.user.email);
    } catch (emailError) {
      console.error('❌ Failed to send approval email:', emailError);
    }
    res.json({ message: 'Report approved successfully', report });
  } catch (err) {
    console.error('approveReport error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.rejectReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id).populate('user', 'fName lName email reputation');
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    const userInfo = {
      fName: report.user.fName,
      email: report.user.email,
    };
    const reportTitle = report.title;
    const reportId = report._id;
    await Report.findByIdAndDelete(req.params.id);
    try {
      const emailMessage = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Report Not Approved</h2>
          <p>Hi ${userInfo.fName},</p>
          <p>We regret to inform you that your report was not approved for public posting.</p>
          <h3>Report Details:</h3>
          <ul>
            <li><strong>Report ID:</strong> ${reportId}</li>
            <li><strong>Title:</strong> ${reportTitle}</li>
          </ul>
          <p><strong>Possible reasons for rejection:</strong></p>
          <ul>
            <li>The report did not meet our community guidelines</li>
            <li>The issue was duplicate or already reported</li>
            <li>Insufficient information provided</li>
            <li>The issue is outside the scope of our service</li>
          </ul>
          <p>If you believe this was a mistake or would like to resubmit with more details, please feel free to create a new report.</p>
          <p>Thank you for your understanding.</p>
        </div>
      `;
      await sendEmailBrevo(
        userInfo.email,
        `Your FixItPH Report Was Not Approved (ID: ${reportId})`,
        emailMessage,
      );
      console.log('📧 Rejection email sent successfully to:', userInfo.email);
    } catch (emailError) {
      console.error('❌ Failed to send rejection email:', emailError);
    }
    res.json({ message: 'Report rejected and deleted successfully' });
  } catch (err) {
    console.error('Reject report error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getResolvedReports = async (req, res) => {
  try {
    const resolvedReports = await ResolvedReport.find()
      .populate('user', 'fName lName email profilePicture reputation')
      .sort({ resolvedAt: -1 }); // Sort by resolved date, newest first
    
    console.log(`📊 Fetched ${resolvedReports.length} resolved reports from ResolvedReport collection`);
    res.json(resolvedReports);
  } catch (err) {
    console.error('getResolvedReports error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update the existing getAllResolvedReports to use the same logic
exports.getAllResolvedReports = async (req, res) => {
  try {
    const resolvedReports = await ResolvedReport.find()
      .populate('user', 'fName lName email profilePicture reputation')
      .sort({ resolvedAt: -1 });
    res.json(resolvedReports);
  } catch (err) {
    console.error('getAllResolvedReports error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Flag a report
exports.flagReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { reason, description } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const report = await Report.findById(reportId).populate('user', 'fName lName email');
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    // Check if user already flagged this report
    if (report.flags && report.flags.some((flag) => flag.userId.toString() === userId)) {
      return res.status(400).json({ message: 'You have already flagged this report' });
    }

    // Initialize flags array if it doesn't exist
    if (!report.flags) {
      report.flags = [];
    }

    // Get the flagger's info
    const flagger = await User.findById(userId).select('fName lName');

    // Add the flag
    report.flags.push({
      userId,
      reason,
      description: description || '',
      createdAt: new Date()
    });

    const previousFlagCount = report.flagCount || 0;
    report.flagCount = report.flags.length;

    await report.save();

    console.log(`🚩 Report ${reportId} flagged by user ${userId}. Total flags: ${report.flagCount}`);

    // Send email notification to the report author
    if (report.user && report.user.email) {
      try {
        const isFirstFlag = previousFlagCount === 0;
        const emailMessage = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #ef4444;">⚠️ Your Report Has Been Flagged</h2>
            <p>Hi ${report.user.fName},</p>
            <p>Your report has received ${isFirstFlag ? 'a flag' : `${report.flagCount} flag(s)`} from ${isFirstFlag ? 'a community member' : 'community members'}.</p>
            
            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 20px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #991b1b;">Report Details:</h3>
              <ul style="margin: 10px 0;">
                <li><strong>Report ID:</strong> ${report._id}</li>
                <li><strong>Title:</strong> ${report.title}</li>
                <li><strong>Total Flags:</strong> ${report.flagCount}</li>
              </ul>
            </div>

            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #92400e;">Latest Flag Reason:</h3>
              <p><strong>${reason}</strong></p>
              ${description ? `<p style="color: #78716c; font-style: italic;">"${description}"</p>` : ''}
            </div>

            ${report.flagCount >= 3 ? `
              <div style="background-color: #fecaca; border: 2px solid #dc2626; padding: 16px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; font-weight: bold; color: #991b1b;">
                  ⚠️ <strong>Important:</strong> Your report has reached ${report.flagCount} flags and is under review by our moderation team. 
                  If the flags are valid, your report may be removed.
                </p>
              </div>
            ` : ''}

            <h3 style="color: #1f2937;">What This Means:</h3>
            <ul style="color: #4b5563;">
              <li>Community members have raised concerns about your report</li>
              <li>Our team will review the flags and your report content</li>
              <li>Please ensure your report follows our <a href="https://fixitph.com/guidelines" style="color: #3b82f6;">community guidelines</a></li>
              ${report.flagCount >= 3 ? '<li><strong>Multiple flags may result in report removal</strong></li>' : ''}
            </ul>

            <h3 style="color: #1f2937;">Common Reasons for Flags:</h3>
            <ul style="color: #4b5563;">
              <li>Spam or irrelevant content</li>
              <li>Misleading or false information</li>
              <li>Offensive or inappropriate content</li>
              <li>Duplicate report</li>
              <li>Violation of community guidelines</li>
            </ul>

            <p style="margin-top: 24px;">
              If you believe this flag is unfair or made in error, you can contact our support team or wait for admin review.
            </p>

            <p style="color: #6b7280; font-size: 14px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
              <strong>Note:</strong> This is an automated notification. Please do not reply to this email.
            </p>

            <div style="margin-top: 24px; padding: 16px; background-color: #f9fafb; border-radius: 4px;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                Thank you for being a part of our community. Together, we can keep FixItPH a helpful and respectful platform.
              </p>
            </div>
          </div>
        `;

        await sendEmailBrevo(
          report.user.email,
          `⚠️ Your FixItPH Report Has Been Flagged (ID: ${report._id})`,
          emailMessage,
        );

        console.log(`📧 Flag notification email sent to ${report.user.email}`);
      } catch (emailError) {
        console.error('❌ Failed to send flag notification email:', emailError);
        // Don't fail the request if email fails
      }
    }

    // If report has too many flags (e.g., 3+), notify admins
    if (report.flagCount >= 3) {
      console.log(`⚠️ Report ${reportId} has reached ${report.flagCount} flags. Consider review.`);
      
      // Send email to admins (you can add admin email notification here)
      try {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@fixitph.com';
        const adminEmailMessage = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2 style="color: #dc2626;">⚠️ Report Requires Immediate Review</h2>
            <p>A report has reached <strong>${report.flagCount} flags</strong> and requires admin attention.</p>
            
            <div style="background-color: #fef2f2; padding: 16px; margin: 20px 0; border-radius: 4px;">
              <h3>Report Details:</h3>
              <ul>
                <li><strong>Report ID:</strong> ${report._id}</li>
                <li><strong>Title:</strong> ${report.title}</li>
                <li><strong>Author:</strong> ${report.user.fName} ${report.user.lName} (${report.user.email})</li>
                <li><strong>Total Flags:</strong> ${report.flagCount}</li>
                <li><strong>Latest Flag Reason:</strong> ${reason}</li>
              </ul>
            </div>

            <p>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin-flag" 
                 style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Review Report Now
              </a>
            </p>
          </div>
        `;

        await sendEmailBrevo({
          adminEmail,
          subject: `⚠️ Urgent: Report ${report._id} Has ${report.flagCount} Flags`,
          html: adminEmailMessage,
        });

        console.log(`📧 Admin notification email sent for report ${reportId}`);
      } catch (adminEmailError) {
        console.error('❌ Failed to send admin notification email:', adminEmailError);
      }
    }

    res.json({
      message: 'Report flagged successfully',
      flagCount: report.flagCount
    });

  } catch (error) {
    console.error('Flag report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getFlaggedReports = async (req, res) => {
  try {
    const flaggedReports = await Report.find({ 
      flagCount: { $gt: 0 } 
    })
      .populate('user', 'fName lName email profilePicture')
      .populate('flags.userId', 'fName lName email')
      .sort({ flagCount: -1, createdAt: -1 });

    console.log(`📊 Found ${flaggedReports.length} flagged reports`);
    res.json(flaggedReports);
  } catch (error) {
    console.error('Get flagged reports error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Dismiss a report flag
exports.dismissFlag = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { flagUserId } = req.body;

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Remove the specific flag
    report.flags = report.flags.filter(
      (flag) => flag.userId.toString() !== flagUserId
    );
    report.flagCount = report.flags.length;

    await report.save();

    console.log(`✅ Dismissed flag from user ${flagUserId} on report ${reportId}`);
    res.json({ message: 'Flag dismissed successfully', flagCount: report.flagCount });
  } catch (error) {
    console.error('Dismiss flag error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Dismiss all flags for a report
exports.dismissAllFlags = async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    report.flags = [];
    report.flagCount = 0;

    await report.save();

    console.log(`✅ Dismissed all flags for report ${reportId}`);
    res.json({ message: 'All flags dismissed successfully' });
  } catch (error) {
    console.error('Dismiss all flags error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getSummary = async (req, res) => {
  try {
    console.log("🚀 Starting AI summary generation with Bytez...");
    
    const apiKey = process.env.BYTEZ_API_KEY;
    console.log("🔑 Bytez API Key status:", apiKey ? `Key present (${apiKey.substring(0, 10)}...)` : "Key missing");

    if (!apiKey) {
      return res.status(500).json({ message: "Bytez API key not configured" });
    }

    // 1. Fetch all active reports AND resolved reports from both collections
    const [activeReports, resolvedReports] = await Promise.all([
      Report.find({})
        .select('title description category location createdAt status isUrgent')
        .lean(),
      ResolvedReport.find({})
        .select('title description category location createdAt resolvedAt isUrgent')
        .lean()
    ]);

    // Combine both arrays and mark resolved reports
    const allReports = [
      ...activeReports.map(r => ({ ...r, isResolved: false })),
      ...resolvedReports.map(r => ({ ...r, status: 'resolved', isResolved: true }))
    ];

    console.log(`📊 Found ${activeReports.length} active reports and ${resolvedReports.length} resolved reports`);
    console.log(`📊 Total reports to summarize: ${allReports.length}`);

    if (allReports.length === 0) {
      return res.json({ 
        success: true,
        aiSummary: "No reports available to summarize.",
        reportCount: 0,
        activeReportCount: 0,
        resolvedReportCount: 0,
        urgentCount: 0,
        categories: [],
        locations: [],
        categoryStats: {},
        locationStats: {},
        modelUsed: "none",
        generatedAt: new Date().toISOString()
      });
    }

    // 2. Calculate statistics for frontend with simplified locations
    const urgentCount = allReports.filter(r => r.isUrgent).length;
    const categories = [...new Set(allReports.map(r => r.category).filter(Boolean))];
    
    // ✅ Extract only the first part of the location (before first comma)
    const simplifiedLocations = allReports.map(r => {
      if (!r.location) return null;
      return r.location.split(',')[0].trim();
    }).filter(Boolean);
    
    const locations = [...new Set(simplifiedLocations)];
    
    // Get category counts and status breakdown
    const categoryStats = {};
    const locationStats = {};
    const statusBreakdown = {
      'awaiting-approval': 0,
      'pending': 0,
      'in-progress': 0,
      'resolved': 0
    };
    
    allReports.forEach(report => {
      if (report.category) {
        categoryStats[report.category] = (categoryStats[report.category] || 0) + 1;
      }
      if (report.location) {
        const simplifiedLocation = report.location.split(',')[0].trim();
        locationStats[simplifiedLocation] = (locationStats[simplifiedLocation] || 0) + 1;
      }
      if (report.status) {
        statusBreakdown[report.status] = (statusBreakdown[report.status] || 0) + 1;
      }
    });

    // 3. Format the reports for AI with emphasis on both active and resolved
    // Prioritize: urgent reports, recent reports, and resolved reports
    const sortedReports = allReports
      .sort((a, b) => {
        // Prioritize urgent reports
        if (a.isUrgent && !b.isUrgent) return -1;
        if (!a.isUrgent && b.isUrgent) return 1;
        // Then by date
        const dateA = new Date(a.resolvedAt || a.createdAt || 0);
        const dateB = new Date(b.resolvedAt || b.createdAt || 0);
        return dateB - dateA;
      })
      .slice(0, 20); // Increased to 20 to include more reports

    const reportsText = sortedReports
      .map(r => {
        const simplifiedLocation = r.location ? r.location.split(',')[0].trim() : 'unknown location';
        const statusLabel = r.isResolved ? '[RESOLVED]' : `[${r.status?.toUpperCase() || 'ACTIVE'}]`;
        const urgentLabel = r.isUrgent ? '[URGENT]' : '';
        return `${urgentLabel}${statusLabel} ${r.category || 'Issue'} in ${simplifiedLocation}: ${(r.description || '').substring(0, 80)}...`;
      })
      .join('. ');

    const prompt = `Summarize these community reports from FixItPH. Include both active and resolved issues. Highlight progress made on resolved reports: ${reportsText}. Focus on main issues, locations, and resolutions.`;

    console.log("🤖 Sending request to Bytez AI...");
    console.log(`📝 Prompt length: ${prompt.length} characters`);

    // 4. ✅ Try models sequentially with delays
    const modelQueue = [
      "facebook/bart-large-cnn",
      "t5-small",
      "gpt2"
    ];

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    let aiSummary = null;
    let usedModel = null;

    for (let i = 0; i < modelQueue.length; i++) {
      const modelName = modelQueue[i];
      
      try {
        console.log(`🔍 Attempting model ${i + 1}/${modelQueue.length}: ${modelName}`);
        
        if (i > 0) {
          console.log(`⏱️ Waiting 3 seconds before next attempt...`);
          await delay(3000);
        }
        
        const model = bytezClient.model(modelName);
        const result = await model.run(prompt);

        console.log(`📦 Model ${modelName} response type:`, typeof result);

        if (result && typeof result === 'object' && result.error) {
          console.log(`❌ Model ${modelName} error:`, result.error);
          
          if (result.error.includes('concurrency') || result.error.includes('rate limit')) {
            console.log(`⏱️ Rate limit detected, waiting 5 seconds...`);
            await delay(5000);
            continue;
          }
          
          continue;
        }

        if (typeof result === 'string') {
          aiSummary = result;
        } else if (result && typeof result === 'object') {
          aiSummary = result.output || result.text || result.summary_text || result.generated_text || result.content;
        }

        if (aiSummary && aiSummary.trim().length > 0) {
          const summaryLower = aiSummary.toLowerCase();
          
          if (summaryLower.includes('upgrade your account') ||
              summaryLower.includes('unauthorized') ||
              summaryLower.includes('rate limit') ||
              summaryLower.includes('<!doctype')) {
            console.log(`❌ Model ${modelName} returned error content`);
            aiSummary = null;
            continue;
          }

          usedModel = modelName;
          console.log(`✅ Successfully generated summary with model: ${modelName}`);
          break;
        }

      } catch (modelError) {
        console.log(`❌ Model ${modelName} failed:`, modelError.message);
        
        if (modelError.message.includes('Unexpected token') || modelError.message.includes('JSON')) {
          console.log(`⏱️ Detected HTML response, waiting 5 seconds before next attempt...`);
          await delay(5000);
        }
      }
    }

    if (!aiSummary) {
      return res.status(500).json({ 
        success: false,
        message: "All AI models failed to generate summary"
      });
    }

    // 5. Return the AI summary and comprehensive stats
    res.json({ 
      success: true,
      aiSummary: aiSummary.trim(),
      reportCount: allReports.length,
      activeReportCount: activeReports.length,
      resolvedReportCount: resolvedReports.length,
      urgentCount,
      statusBreakdown,
      categories: categories.slice(0, 5),
      locations: locations.slice(0, 5),
      categoryStats,
      locationStats,
      modelUsed: usedModel,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ AI Summary generation failed:", error);
    res.status(500).json({ 
      success: false,
      message: "AI summary generation failed", 
      error: error.message
    });
  }
};