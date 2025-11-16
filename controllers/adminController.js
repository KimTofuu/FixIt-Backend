const bcrypt = require('bcryptjs');
const Admin = require('../models/Admins');
const jwt = require('jsonwebtoken');
const Report = require('../models/Report');
const User = require('../models/Users'); // Add this
const { sendEmailBrevo, emailTemplates } = require('../config/emailConfig');
const SuspendedUser = require('../models/Suspended'); 

// --- Admin Registration ---
exports.register = async (req, res) => {
  try {
    const {
      barangayName,
      officialEmail,
      password,
      barangayAddress,
      officialContact,
      municipality,
    } = req.body;

    let admin = await Admin.findOne({ officialEmail });
    if (admin) {
      return res.status(400).json({ message: 'Admin with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    admin = new Admin({
      barangayName,
      officialEmail,
      password: hashedPassword,
      barangayAddress,
      officialContact,
      municipality,
    });

    await admin.save();
    res.status(201).json({ message: 'Admin registered successfully' });
  } catch (err) {
    console.error('Admin registration error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// --- Admin Login ---
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ officialEmail: email });
    if (!admin) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // --- CRITICAL PART ---
    // Create a JWT payload that explicitly sets the role to 'admin'
    const payload = {
      userId: admin._id,
      email: admin.officialEmail,
      role: 'admin', // This will satisfy your isAdmin middleware
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.json({
      message: "Admin logged in successfully",
      token,
      admin: {
        id: admin._id,
        email: admin.officialEmail,
        barangayName: admin.barangayName,
      },
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// --- Update Report Status ---
exports.updateReportStatus = async (req, res) => {
    try {
        const { reportId } = req.params;
        const { status } = req.body;

        if (!['pending', 'in-progress', 'resolved'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        const report = await Report.findByIdAndUpdate(reportId, { status }, { new: true });

        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        res.json(report);
    } catch (err) {
        console.error('Update status error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// --- Reject (Delete) a Report ---
exports.rejectReport = async (req, res) => {
  try {
    const report = await Report.findByIdAndDelete(req.params.id);
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    res.json({ message: 'Report rejected and deleted successfully' });
  } catch (err) {
    console.error('Reject report error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get admin profile
exports.getProfile = async (req, res) => {
  try {
    const adminId = req.user.userId; // From JWT token
    const admin = await Admin.findById(adminId).select('-password'); // Exclude password
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.json(admin);
  } catch (err) {
    console.error('Get admin profile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update admin profile
exports.updateProfile = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const { barangayName, barangayAddress, municipality, officialContact, password } = req.body;

    const updateData = {
      barangayName,
      barangayAddress,
      municipality,
      officialContact,
    };

    // If password is provided, hash it
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    const admin = await Admin.findByIdAndUpdate(
      adminId,
      updateData,
      { new: true }
    ).select('-password');

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.json({ message: 'Profile updated successfully', admin });
  } catch (err) {
    console.error('Update admin profile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteFlaggedReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { reason } = req.body; // ✅ Made optional - no validation

    const report = await Report.findById(reportId).populate('user', 'fName lName email');
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    const reportTitle = report.title;
    const reportOwner = report.user;
    const ownerName = reportOwner ? `${reportOwner.fName} ${reportOwner.lName}` : 'User';
    
    // ✅ Use default reason if not provided
    const removalReason = reason || 'This report was flagged by community members and removed by administrators.';

    // Send email to report owner
    if (reportOwner && reportOwner.email) {
      try {
        const emailContent = emailTemplates.reportRemoved(ownerName, reportTitle, removalReason);
        
        await sendEmailBrevo(
          reportOwner.email,
          emailContent.subject,
          emailContent.html
        );
        
        console.log(`📧 Report removal notification sent to ${reportOwner.email}`);
      } catch (emailError) {
        console.error('❌ Failed to send removal notification:', emailError);
      }
    }

    // Send thank you emails to all flaggers
    if (report.flags && report.flags.length > 0) {
      for (const flag of report.flags) {
        try {
          const flagger = await User.findById(flag.userId).select('fName lName email');
          
          if (flagger && flagger.email) {
            const flaggerName = `${flagger.fName} ${flagger.lName}`;
            const emailContent = emailTemplates.thankFlagger(flaggerName, reportTitle);
            
            await sendEmailBrevo(
              flagger.email,
              emailContent.subject,
              emailContent.html
            );
            
            console.log(`✅ Thank you email sent to flagger: ${flagger.email}`);
          }
        } catch (emailError) {
          console.error('❌ Failed to send thank you email to flagger:', emailError);
        }
      }
    }

    // Delete the report
    await Report.findByIdAndDelete(reportId);
    
    console.log(`🗑️ Flagged report ${reportId} deleted successfully`);
    
    res.json({ 
      message: 'Flagged report deleted successfully',
      emailsSent: true
    });

  } catch (err) {
    console.error('❌ Delete flagged report error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// --- Batch Delete Multiple Flagged Reports ---
exports.batchDeleteReports = async (req, res) => {
  try {
    const { reportIds } = req.body; // Array of report IDs
    const adminId = req.user.userId;

    if (!Array.isArray(reportIds) || reportIds.length === 0) {
      return res.status(400).json({ message: 'Please provide an array of report IDs' });
    }

    console.log(`🗑️ Admin ${adminId} attempting to delete ${reportIds.length} reports`);

    const deleteResult = await Report.deleteMany({ 
      _id: { $in: reportIds } 
    });

    console.log(`✅ Deleted ${deleteResult.deletedCount} reports`);

    res.json({ 
      message: `Successfully deleted ${deleteResult.deletedCount} report(s)`,
      deletedCount: deleteResult.deletedCount
    });

  } catch (err) {
    console.error('❌ Batch delete reports error:', err);
    res.status(500).json({ message: 'Server error while deleting reports' });
  }
};

// --- Delete Report and Ban User (Nuclear option) ---
exports.deleteReportAndWarnUser = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { warningMessage } = req.body;
    const adminId = req.user.userId;

    const report = await Report.findById(reportId).populate('user', 'fName lName email');
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    const userId = report.user._id;
    const ownerName = `${report.user.fName} ${report.user.lName}`;

    console.log(`⚠️ Admin ${adminId} deleting report and warning user ${ownerName}`);

    // Delete the report
    await Report.findByIdAndDelete(reportId);

    console.log(`✅ Report deleted and user ${ownerName} warned: ${warningMessage || 'No message'}`);

    res.json({ 
      message: 'Report deleted and user warned successfully',
      deletedReport: {
        id: reportId,
        title: report.title,
        user: ownerName
      },
      warning: warningMessage || 'Generic warning issued'
    });

  } catch (err) {
    console.error('❌ Delete and warn error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('fName lName email address barangay archived lastLogin createdAt reputation')
      .sort({ createdAt: -1 });

    const formattedUsers = users.map(user => ({
      _id: user._id,
      id: user._id,
      name: `${user.fName} ${user.lName}`,
      email: user.email,
      address: user.address || user.barangay || 'No address provided',
      archived: user.archived || false,
      lastLogin: user.lastLogin,
      reputation: user.reputation
    }));

    res.json(formattedUsers);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Server error while fetching users' });
  }
};

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('fName lName email address barangay archived lastLogin createdAt reputation');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user's report count
    const reportCount = await Report.countDocuments({ user: userId });

    res.json({
      _id: user._id,
      id: user._id,
      name: `${user.fName} ${user.lName}`,
      email: user.email,
      address: user.address || user.barangay || 'No address provided',
      archived: user.archived || false,
      lastLogin: user.lastLogin,
      reputation: user.reputation,
      reportCount
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ message: 'Server error while fetching user' });
  }
};

// Archive user
exports.archiveUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.user.userId;

    console.log(`📦 Admin ${adminId} attempting to archive user ${userId}`);

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.archived) {
      return res.status(400).json({ message: 'User is already archived' });
    }

    user.archived = true;
    user.archivedAt = new Date();
    user.archivedBy = adminId;
    await user.save();

    console.log(`✅ User ${userId} archived successfully by admin ${adminId}`);

    res.json({
      message: 'User archived successfully',
      user: {
        _id: user._id,
        name: `${user.fName} ${user.lName}`,
        archived: user.archived
      }
    });
  } catch (error) {
    console.error('Archive user error:', error);
    res.status(500).json({ message: 'Server error while archiving user' });
  }
};

// Unarchive user
exports.unarchiveUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.user.userId;

    console.log(`📦 Admin ${adminId} attempting to unarchive user ${userId}`);

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.archived) {
      return res.status(400).json({ message: 'User is not archived' });
    }

    user.archived = false;
    user.archivedAt = null;
    user.archivedBy = null;
    await user.save();

    console.log(`✅ User ${userId} unarchived successfully by admin ${adminId}`);

    res.json({
      message: 'User unarchived successfully',
      user: {
        _id: user._id,
        name: `${user.fName} ${user.lName}`,
        archived: user.archived
      }
    });
  } catch (error) {
    console.error('Unarchive user error:', error);
    res.status(500).json({ message: 'Server error while unarchiving user' });
  }
};

// Get user statistics
exports.getUserStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({
      archived: { $ne: true },
      lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    const archivedUsers = await User.countDocuments({ archived: true });
    const totalReports = await Report.countDocuments();

    res.json({
      totalUsers,
      activeUsers,
      archivedUsers,
      totalReports
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ message: 'Server error while fetching stats' });
  }
};

exports.suspendUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const adminId = req.user.userId;

    console.log(`🚫 Admin ${adminId} attempting to suspend user ${userId}`);

    // Find the user in the Users collection
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is already suspended
    const existingSuspension = await SuspendedUser.findOne({ originalUserId: userId });
    if (existingSuspension) {
      return res.status(400).json({ message: 'User is already suspended' });
    }

    // ✅ Create suspended user record matching fields
    const suspendedUser = new SuspendedUser({
      originalUserId: user._id,
      fName: user.fName,
      lName: user.lName,
      email: user.email,
      password: user.password,
      address: user.address || user.barangay || '', // ✅ Use address or barangay
      barangay: user.barangay || '',
      contact: user.contact || '', 
      municipality: user.municipality || '', // ✅ Add municipality
      profilePicture: user.profilePicture,
      reputation: user.reputation || {
        points: 0,
        level: 'Newcomer',
        badges: [],
        totalReports: 0,
        verifiedReports: 0,
        resolvedReports: 0,
        helpfulVotes: 0
      },
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      suspended: true,
      suspendedAt: new Date(),
      suspensionReason: reason,
      suspendedBy: adminId,
      originalData: user.toObject() // Store complete original data
    });

    // Save suspended user
    await suspendedUser.save();
    console.log(`✅ User moved to SuspendedUsers collection`);

    // Delete user from Users collection
    await User.findByIdAndDelete(userId);
    console.log(`✅ User removed from Users collection`);

    // Send suspension email
    if (user.email) {
      try {
        const ownerName = `${user.fName} ${user.lName}`;
        const suspensionEmail = emailTemplates.userSuspended(ownerName, reason);
        await sendEmailBrevo(user.email, suspensionEmail.subject, suspensionEmail.html);
        console.log(`📧 Suspension notification sent to ${user.email}`);
      } catch (emailError) {
        console.error('⚠️ Failed to send suspension email:', emailError);
        // Don't fail the request if email fails
      }
    }

    res.json({
      message: 'User suspended successfully and moved to suspended users table',
      user: {
        _id: suspendedUser._id,
        originalUserId: suspendedUser.originalUserId,
        name: `${suspendedUser.fName} ${suspendedUser.lName}`,
        email: suspendedUser.email,
        suspended: true,
        suspendedAt: suspendedUser.suspendedAt,
        suspensionReason: suspendedUser.suspensionReason
      }
    });
  } catch (error) {
    console.error('❌ Suspend user error:', error);
    res.status(500).json({ message: 'Server error while suspending user' });
  }
};

// Unsuspend user - Move from SuspendedUsers back to Users table
exports.unsuspendUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.user.userId;

    console.log(`✅ Admin ${adminId} attempting to unsuspend user ${userId}`);

    // Find the suspended user (userId could be either _id or originalUserId)
    const suspendedUser = await SuspendedUser.findOne({
      $or: [{ _id: userId }, { originalUserId: userId }]
    });

    if (!suspendedUser) {
      console.log('❌ Suspended user not found');
      return res.status(404).json({ message: 'Suspended user not found' });
    }

    console.log('📋 Found suspended user:', suspendedUser.email);

    // ✅ Check if user already exists in Users collection by email OR _id
    const existingUserByEmail = await User.findOne({ email: suspendedUser.email });
    const existingUserById = await User.findById(suspendedUser.originalUserId);

    if (existingUserByEmail || existingUserById) {
      console.log('⚠️ User already exists in active users collection');
      
      // Delete the suspended record
      await SuspendedUser.findByIdAndDelete(suspendedUser._id);
      console.log('✅ Removed duplicate suspended user record');
      
      const finalUser = existingUserByEmail || existingUserById;
      return res.status(200).json({ 
        message: 'User already exists in active users. Suspension record removed.',
        user: {
          _id: finalUser._id,
          name: `${finalUser.fName} ${finalUser.lName}`,
          email: finalUser.email,
          suspended: false
        }
      });
    }

    // ✅ Prepare user data matching User schema
    const userData = {
      fName: suspendedUser.fName,
      lName: suspendedUser.lName,
      email: suspendedUser.email,
      password: suspendedUser.password,
      contact: suspendedUser.contact || '',
      contactVerified: false,
      barangay: suspendedUser.barangay || '',
      municipality: suspendedUser.municipality || '',
      profilePicture: suspendedUser.profilePicture || { url: '', public_id: '' },
      role: 'user',
      reputation: suspendedUser.reputation || {
        points: 0,
        level: 'Newcomer',
        badges: [],
        totalReports: 0,
        verifiedReports: 0,
        resolvedReports: 0,
        helpfulVotes: 0
      },
      lastActive: new Date(),
      lastLogin: suspendedUser.lastLogin || new Date(),
      createdAt: suspendedUser.createdAt || new Date(),
      archived: false
    };

    console.log('📝 Prepared user data for:', userData.email);

    // ✅ Try to insert directly with original _id
    try {
      const insertResult = await User.collection.insertOne({
        _id: suspendedUser.originalUserId,
        ...userData,
        __v: 0,
        updatedAt: new Date()
      });
      console.log(`✅ User restored to Users collection with original ID:`, insertResult.insertedId);
    } catch (insertError) {
      console.error('❌ Insert error:', insertError.message);
      
      // ✅ If duplicate key error on email, it means user exists - just remove suspension record
      if (insertError.code === 11000) {
        console.log('⚠️ Duplicate key error - user already exists');
        
        // Check which field caused the duplicate
        if (insertError.message.includes('email')) {
          console.log('⚠️ User with this email already exists');
          
          // Find the existing user
          const existingUser = await User.findOne({ email: suspendedUser.email });
          
          if (existingUser) {
            // Delete the suspended record since user is already active
            await SuspendedUser.findByIdAndDelete(suspendedUser._id);
            console.log('✅ Removed suspended user record - user is already active');
            
            return res.status(200).json({
              message: 'User already exists in active users',
              user: {
                _id: existingUser._id,
                name: `${existingUser.fName} ${existingUser.lName}`,
                email: existingUser.email,
                suspended: false
              }
            });
          }
        }
        
        throw new Error('User already exists in the database');
      } else {
        // Other errors
        throw insertError;
      }
    }

    // Delete from SuspendedUsers collection
    await SuspendedUser.findByIdAndDelete(suspendedUser._id);
    console.log(`✅ User removed from SuspendedUsers collection`);

    // Get the restored user for response
    const finalUser = await User.findById(suspendedUser.originalUserId);

    if (!finalUser) {
      throw new Error('Failed to retrieve restored user');
    }

    console.log('✅ Final user retrieved:', {
      id: finalUser._id,
      email: finalUser.email,
      name: `${finalUser.fName} ${finalUser.lName}`
    });

    // Send unsuspension email
    if (finalUser.email) {
      try {
        const ownerName = `${finalUser.fName} ${finalUser.lName}`;
        const unsuspensionEmail = emailTemplates.userUnsuspended(userName);
        await sendEmailBrevo(finalUser.email, unsuspensionEmail.subject, unsuspensionEmail.html);
        console.log(`📧 Unsuspension notification sent to ${finalUser.email}`);
      } catch (emailError) {
        console.error('⚠️ Failed to send unsuspension email:', emailError);
        // Don't fail the request if email fails
      }
    }

    res.json({
      message: 'User unsuspended successfully and restored to active users',
      user: {
        _id: finalUser._id,
        name: `${finalUser.fName} ${finalUser.lName}`,
        email: finalUser.email,
        suspended: false
      }
    });
  } catch (error) {
    console.error('❌ Unsuspend user error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error while unsuspending user',
      error: error.message 
    });
  }
};

// Get all users (including suspended users from separate table)
exports.getAllUsers = async (req, res) => {
  try {
    // Get active users
    const activeUsers = await User.find()
      .select('fName lName email address barangay lastLogin createdAt reputation')
      .sort({ createdAt: -1 });

    // Get suspended users
    const suspendedUsers = await SuspendedUser.find()
      .select('originalUserId fName lName email address barangay lastLogin createdAt reputation suspended suspendedAt suspensionReason')
      .sort({ suspendedAt: -1 });

    // Format active users
    const formattedActiveUsers = activeUsers.map(user => ({
      _id: user._id,
      id: user._id,
      name: `${user.fName} ${user.lName}`,
      email: user.email,
      address: user.address || user.barangay || 'No address provided',
      suspended: false,
      lastLogin: user.lastLogin,
      reputation: user.reputation
    }));

    // Format suspended users
    const formattedSuspendedUsers = suspendedUsers.map(user => ({
      _id: user.originalUserId, // Use original user ID for consistency
      id: user.originalUserId,
      name: `${user.fName} ${user.lName}`,
      email: user.email,
      address: user.address || user.barangay || 'No address provided',
      suspended: true,
      suspendedAt: user.suspendedAt,
      suspensionReason: user.suspensionReason,
      lastLogin: user.lastLogin,
      reputation: user.reputation
    }));

    // Combine both arrays
    const allUsers = [...formattedActiveUsers, ...formattedSuspendedUsers];

    res.json(allUsers);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Server error while fetching users' });
  }
};

// Get user statistics (updated to include suspended users)
exports.getUserStats = async (req, res) => {
  try {
    const totalActiveUsers = await User.countDocuments();
    const totalSuspendedUsers = await SuspendedUser.countDocuments();
    const totalUsers = totalActiveUsers + totalSuspendedUsers;
    
    const activeUsers = await User.countDocuments({
      lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    
    const totalReports = await Report.countDocuments();

    res.json({
      totalUsers,
      activeUsers,
      suspendedUsers: totalSuspendedUsers,
      totalReports
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ message: 'Server error while fetching stats' });
  }
};

// Get suspended users only
exports.getSuspendedUsers = async (req, res) => {
  try {
    const suspendedUsers = await SuspendedUser.find()
      .populate('suspendedBy', 'barangayName officialEmail')
      .select('originalUserId fName lName email address barangay suspendedAt suspensionReason suspendedBy reputation')
      .sort({ suspendedAt: -1 });

    const formatted = suspendedUsers.map(user => ({
      _id: user.originalUserId,
      id: user.originalUserId,
      name: `${user.fName} ${user.lName}`,
      email: user.email,
      address: user.address || user.barangay || 'No address provided',
      suspended: true,
      suspendedAt: user.suspendedAt,
      suspensionReason: user.suspensionReason,
      suspendedBy: user.suspendedBy,
      reputation: user.reputation
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Get suspended users error:', error);
    res.status(500).json({ message: 'Server error while fetching suspended users' });
  }
};

exports.notifyAuthority = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { authorityEmail } = req.body;
    const adminId = req.user.userId;

    console.log(`📧 Admin ${adminId} sending report ${reportId} to authority: ${authorityEmail}`);

    // Find the report with populated user data
    const report = await Report.findById(reportId)
      .populate('user', 'fName lName email');

    if (!report) {
      console.log('❌ Report not found');
      return res.status(404).json({ message: 'Report not found' });
    }

    // Get admin details
    const admin = await Admin.findById(adminId);
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Find authority details
    const Authority = require('../models/Authority');
    const authority = await Authority.findOne({ contactEmail: authorityEmail });

    if (!authority) {
      console.log('⚠️ Authority not found, proceeding with email only');
    }

    // Prepare report details
    const reporterName = report.user 
      ? `${report.user.fName} ${report.user.lName}` 
      : 'Anonymous User';
    
    const reportDetails = {
      title: report.title,
      category: report.category || 'Unspecified',
      location: report.location,
      latitude: report.latitude || null,
      longitude: report.longitude || null,
      description: report.description,
      status: report.status,
      reportedBy: reporterName,
      reportedAt: report.createdAt || report.timestamp,
      imageUrl: report.images?.[0] || report.imageUrl || report.image || null,
      reportId: report._id,
      isUrgent: report.isUrgent || false,
    };

    // Create Google Maps link if coordinates are available
    const mapsLink = (reportDetails.latitude && reportDetails.longitude)
      ? `https://www.google.com/maps?q=${reportDetails.latitude},${reportDetails.longitude}`
      : null;

    // ✅ Use email template from emailConfig
    const authorityName = authority ? authority.authorityName : 'Concerned Authority';
    const emailContent = emailTemplates.notifyAuthority(authorityName, reportDetails, admin, mapsLink);

    // ✅ Send email using template
    await sendEmailBrevo(
      authorityEmail,
      emailContent.subject,
      emailContent.html
    );
    
    console.log(`✅ Report sent to ${authorityEmail}`);

    // Optional: Update report to track that it was forwarded
    report.forwardedTo = report.forwardedTo || [];
    report.forwardedTo.push({
      authorityEmail,
      authorityName: authority?.authorityName || 'Unknown Authority',
      forwardedBy: adminId,
      forwardedAt: new Date(),
    });
    await report.save();

    res.json({
      message: 'Report successfully sent to authority',
      sentTo: {
        email: authorityEmail,
        authority: authority?.authorityName || 'Unknown Authority',
        department: authority?.department || 'N/A',
      },
      report: {
        id: report._id,
        title: report.title,
        category: report.category,
        location: report.location,
        latitude: reportDetails.latitude,
        longitude: reportDetails.longitude,
      }
    });

  } catch (error) {
    console.error('❌ Notify authority error:', error);
    res.status(500).json({ 
      message: 'Server error while notifying authority',
      error: error.message 
    });
  }
};

module.exports = exports;