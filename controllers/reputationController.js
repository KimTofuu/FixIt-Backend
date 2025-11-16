const User = require('../models/Users');
const Report = require('../models/Report');

// Reputation point values
const REPUTATION_POINTS = {
  CREATE_REPORT: 10,
  VERIFIED_REPORT: 50,
  RESOLVED_REPORT: 100,
  HELPFUL_VOTE: 5,
  URGENT_REPORT_RESOLVED: 150,
  FIRST_REPORT: 20,
};

// Helper function to calculate level based on points
const calculateLevel = (points) => {
  if (points >= 1000) return 'Legend';
  if (points >= 500) return 'Expert';
  if (points >= 250) return 'Veteran';
  if (points >= 100) return 'Contributor';
  if (points >= 50) return 'Active';
  return 'Newcomer';
};

// Get user reputation
exports.getUserReputation = async (req, res) => {
  try {
    const userId = req.params.userId || req.userId;
    
    const user = await User.findById(userId).select('fName lName reputation profilePicture');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      user: {
        fName: user.fName,
        lName: user.lName,
        profilePicture: user.profilePicture,
      },
      reputation: user.reputation,
    });
  } catch (err) {
    console.error('Get reputation error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Award reputation for creating a report
exports.awardReportCreation = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;
    
    user.reputation.totalReports += 1;
    
    // Award points
    let points = REPUTATION_POINTS.CREATE_REPORT;
    if (user.reputation.totalReports === 1) {
      points += REPUTATION_POINTS.FIRST_REPORT; // Bonus for first report
    }
    
    await user.addReputationPoints(points, 'Creating a report');
    await user.checkAndAwardBadges();
    
    return user.reputation;
  } catch (err) {
    console.error('Award report creation error:', err);
  }
};

// Award reputation for verified report
exports.awardVerifiedReport = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;
    
    user.reputation.verifiedReports += 1;
    await user.addReputationPoints(REPUTATION_POINTS.VERIFIED_REPORT, 'Report verified by admin');
    await user.checkAndAwardBadges();
    
    return user.reputation;
  } catch (err) {
    console.error('Award verified report error:', err);
  }
};

// Award reputation for resolved report
exports.awardResolvedReport = async (reportId) => {
  try {
    const report = await Report.findById(reportId).populate('user');
    if (!report || !report.user) return;
    
    const user = report.user;
    user.reputation.resolvedReports += 1;
    
    let points = REPUTATION_POINTS.RESOLVED_REPORT;
    if (report.priority === 'urgent') {
      points = REPUTATION_POINTS.URGENT_REPORT_RESOLVED;
    }
    
    await user.addReputationPoints(points, 'Report resolved');
    await user.checkAndAwardBadges();
    
    return user.reputation;
  } catch (err) {
    console.error('Award resolved report error:', err);
  }
};

// Award helpful vote reputation
const awardHelpfulVote = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Initialize reputation if it doesn't exist
    if (!user.reputation) {
      user.reputation = {
        points: 0,
        level: 'Newcomer',
        badges: [],
        totalReports: 0,
        verifiedReports: 0,
        resolvedReports: 0,
        helpfulVotes: 0
      };
    }

    // Award points
    user.reputation.points += REPUTATION_POINTS.HELPFUL_VOTE; // 5 points
    user.reputation.helpfulVotes = (user.reputation.helpfulVotes || 0) + 1;

    // Update level based on points
    user.reputation.level = calculateLevel(user.reputation.points);

    await user.save();

    console.log(`✅ ${user.fName} ${user.lName} earned ${REPUTATION_POINTS.HELPFUL_VOTE} points for: Receiving a helpful vote`);

    return user.reputation;
  } catch (error) {
    console.error('Award helpful vote error:', error);
    throw error;
  }
};

// Vote report as helpful
exports.voteHelpful = async (req, res) => {
  try {
    const { reportId } = req.params;
    const userId = req.user?.userId || req.userId;

    console.log('🗳️ Vote request:', { reportId, userId });

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const report = await Report.findById(reportId).populate('user', '_id fName lName email');

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    console.log('📄 Report found:', {
      reportId: report._id,
      authorId: report.user._id,
      currentVotes: report.helpfulVotes,
      votedBy: report.votedBy
    });

    // Check if user is voting their own report
    const reportAuthorId = report.user._id.toString();
    const voterUserId = userId.toString();

    if (reportAuthorId === voterUserId) {
      console.log('❌ User trying to vote own report');
      return res.status(400).json({ message: "You can't vote your own report" });
    }

    // Initialize votedBy array if it doesn't exist
    if (!report.votedBy) {
      report.votedBy = [];
    }

    // Check if user already voted (convert all IDs to strings for comparison)
    const hasVoted = report.votedBy.some(id => id.toString() === voterUserId);
    
    if (hasVoted) {
      console.log('❌ User already voted');
      return res.status(400).json({ message: 'You already voted this report as helpful' });
    }

    // Add vote
    report.helpfulVotes = (report.helpfulVotes || 0) + 1;
    report.votedBy.push(userId);
    
    await report.save();

    console.log('✅ Vote saved:', {
      newVoteCount: report.helpfulVotes,
      votedBy: report.votedBy
    });

    // Award reputation to report author
    try {
      await awardHelpfulVote(report.user._id);
      console.log('✅ Reputation awarded to author');
    } catch (repError) {
      console.error('❌ Reputation award error:', repError);
      // Don't fail the whole request if reputation fails
    }

    // Return the updated data with IDs as strings
    res.json({
      message: 'Vote recorded',
      helpfulVotes: report.helpfulVotes,
      votedBy: report.votedBy.map(id => id.toString()) // Convert ObjectIds to strings
    });
  } catch (err) {
    console.error('❌ Vote helpful error:', err);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Get leaderboard
exports.getLeaderboard = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const topUsers = await User.find({ role: 'user' })
      .select('fName lName reputation profilePicture')
      .sort({ 'reputation.points': -1 })
      .limit(limit);
    
    res.json(topUsers);
  } catch (err) {
    console.error('Get leaderboard error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = exports;