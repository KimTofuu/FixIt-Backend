const mongoose = require('mongoose');
const { sendEmailBrevo } = require('../config/emailConfig'); // Add this import at the top

const userSchema = new mongoose.Schema({
  fName: {
    type: String,
    required: true,
  },
  lName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  contact: {
    type: String,
    required: false,
    default: '',
  },
  contactVerified: {
    type: Boolean,
    default: false,
  },
  password: {
    type: String,
    required: false,
    default: '',
  },
  barangay: {
    type: String,
    required: false,
    default: '',
  },
  municipality: {
    type: String,
    required: false,
    default: '',
  },
  profilePicture: {
    url: { type: String, default: '' },
    public_id: { type: String, default: '' },
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  // Password reset fields
  resetPasswordToken: {
    type: String,
  },
  resetPasswordExpires: {
    type: Date,
  },
  // Reputation System
  reputation: {
    points: {
      type: Number,
      default: 0,
    },
    level: {
      type: String,
      enum: ['Newcomer', 'Active', 'Contributor', 'Veteran', 'Expert', 'Legend'], 
      default: 'Newcomer',
    },
    badges: [{
      name: String,
      icon: String,
      earnedAt: { type: Date, default: Date.now },
    }],
    totalReports: {
      type: Number,
      default: 0,
    },
    verifiedReports: {
      type: Number,
      default: 0,
    },
    resolvedReports: {
      type: Number,
      default: 0,
    },
    helpfulVotes: {
      type: Number,
      default: 0,
    },
  },
  // Activity tracking
  lastActive: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Additional fields
  archived: {
    type: Boolean,
    default: false
  },
  archivedAt: {
    type: Date
  },
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true // Make sure this exists
});

// Method to calculate reputation level based on points
userSchema.methods.updateReputationLevel = function() {
  const points = this.reputation.points;
  
  if (points >= 1000) {
    this.reputation.level = 'Guardian';
  } else if (points >= 500) {
    this.reputation.level = 'Expert';
  } else if (points >= 200) {
    this.reputation.level = 'Trusted';
  } else if (points >= 50) {
    this.reputation.level = 'Contributor';
  } else {
    this.reputation.level = 'Newcomer';
  }
};

// Method to add reputation points
userSchema.methods.addReputationPoints = async function(points, reason) {
  this.reputation.points += points;
  this.updateReputationLevel();
  await this.save();
  
  console.log(`✅ ${this.fName} earned ${points} points for: ${reason}`);
  return this.reputation.points;
};

// Method to check and award badges
userSchema.methods.checkAndAwardBadges = async function () {
  if (!this.reputation) return;
  
  const badges = this.reputation.badges || [];
  const newBadgesEarned = [];
  
  // Helper function to check if badge already exists
  const hasBadge = (badgeName) => {
    return badges.some(badge => badge.name === badgeName);
  };

  // Helper function to add badge
  const addBadge = (name, icon, description) => {
    badges.push({
      name,
      icon,
      earnedAt: new Date()
    });
    newBadgesEarned.push({ name, icon, description });
    console.log(`🏅 Badge awarded: ${name}`);
  };
  
  // First Report badge
  if (this.reputation.totalReports >= 1 && !hasBadge('First Report')) {
    addBadge('First Report', '🌟', 'Created your first report');
  }
  
  // Reporter badge (5 reports)
  if (this.reputation.totalReports >= 5 && !hasBadge('Reporter')) {
    addBadge('Reporter', '📝', 'Submitted 5 reports');
  }
  
  // Active Reporter badge (10 reports)
  if (this.reputation.totalReports >= 10 && !hasBadge('Active Reporter')) {
    addBadge('Active Reporter', '📋', 'Submitted 10 reports');
  }

  // Super Reporter badge (25 reports)
  if (this.reputation.totalReports >= 25 && !hasBadge('Super Reporter')) {
    addBadge('Super Reporter', '⭐', 'Submitted 25 reports');
  }

  // Report Legend badge (50 reports)
  if (this.reputation.totalReports >= 50 && !hasBadge('Report Legend')) {
    addBadge('Report Legend', '🏆', 'Submitted 50 reports');
  }
  
  // Verified Contributor badge
  if (this.reputation.verifiedReports >= 5 && !hasBadge('Verified Contributor')) {
    addBadge('Verified Contributor', '✅', 'Had 5 reports verified by admins');
  }

  // Trusted Source badge (10 verified)
  if (this.reputation.verifiedReports >= 10 && !hasBadge('Trusted Source')) {
    addBadge('Trusted Source', '🌟', 'Had 10 reports verified by admins');
  }
  
  // Problem Solver badge (5 resolved)
  if (this.reputation.resolvedReports >= 5 && !hasBadge('Problem Solver')) {
    addBadge('Problem Solver', '🔧', 'Had 5 reports resolved');
  }

  // Community Hero badge (10 resolved)
  if (this.reputation.resolvedReports >= 10 && !hasBadge('Community Hero')) {
    addBadge('Community Hero', '🦸', 'Had 10 reports resolved');
  }

  // Impact Maker badge (25 resolved)
  if (this.reputation.resolvedReports >= 25 && !hasBadge('Impact Maker')) {
    addBadge('Impact Maker', '💫', 'Had 25 reports resolved');
  }

  // Helpful Citizen badge (10 helpful votes)
  if (this.reputation.helpfulVotes >= 10 && !hasBadge('Helpful Citizen')) {
    addBadge('Helpful Citizen', '👍', 'Received 10 helpful votes');
  }

  // Top Contributor badge (25 helpful votes)
  if (this.reputation.helpfulVotes >= 25 && !hasBadge('Top Contributor')) {
    addBadge('Top Contributor', '🌟', 'Received 25 helpful votes');
  }

  // Community Champion badge (50 helpful votes)
  if (this.reputation.helpfulVotes >= 50 && !hasBadge('Community Champion')) {
    addBadge('Community Champion', '👑', 'Received 50 helpful votes');
  }
  
  this.reputation.badges = badges;
  await this.save();

  // ✅ Send email for each new badge earned
  if (newBadgesEarned.length > 0 && this.email) {
    try {
      const badgesHtml = newBadgesEarned.map(badge => `
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 12px 0; border-radius: 8px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 32px;">${badge.icon}</span>
            <div>
              <h3 style="margin: 0; color: #92400e; font-size: 18px;">${badge.name}</h3>
              <p style="margin: 4px 0 0 0; color: #78716c; font-size: 14px;">${badge.description}</p>
            </div>
          </div>
        </div>
      `).join('');

      const emailMessage = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Achievement Unlocked!</h1>
          </div>

          <div style="background-color: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <p style="font-size: 16px; color: #1f2937;">Hi <strong>${this.fName}</strong>,</p>
            
            <p style="font-size: 16px; color: #1f2937;">
              Congratulations! You've earned ${newBadgesEarned.length} new achievement${newBadgesEarned.length > 1 ? 's' : ''} on FixIt PH! 🎊
            </p>

            <div style="margin: 24px 0;">
              <h2 style="color: #1f2937; font-size: 20px; margin-bottom: 16px;">
                ${newBadgesEarned.length > 1 ? 'New Achievements:' : 'New Achievement:'}
              </h2>
              ${badgesHtml}
            </div>

            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 24px 0;">
              <h3 style="color: #1f2937; margin-top: 0;">📊 Your Current Stats</h3>
              <ul style="list-style: none; padding: 0; margin: 0;">
                <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                  <strong>Total Points:</strong> ${this.reputation.points}
                </li>
                <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                  <strong>Level:</strong> ${this.reputation.level}
                </li>
                <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                  <strong>Total Badges:</strong> ${badges.length}
                </li>
                <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                  <strong>Reports Submitted:</strong> ${this.reputation.totalReports}
                </li>
                <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                  <strong>Verified Reports:</strong> ${this.reputation.verifiedReports}
                </li>
                <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                  <strong>Resolved Reports:</strong> ${this.reputation.resolvedReports}
                </li>
                <li style="padding: 8px 0;">
                  <strong>Helpful Votes:</strong> ${this.reputation.helpfulVotes}
                </li>
              </ul>
            </div>

            <div style="text-align: center; margin: 32px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/user-profile" 
                 style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                View Your Profile
              </a>
            </div>

            <p style="color: #6b7280; font-size: 14px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
              Keep up the great work! Together, we're making our community better. 💪
            </p>
          </div>

          <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p style="margin: 0;">This is an automated notification from FixIt PH</p>
            <p style="margin: 8px 0 0 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" style="color: #667eea; text-decoration: none;">Visit FixIt PH</a>
            </p>
          </div>
        </div>
      `;

      await sendEmailBrevo({
        to: this.email,
        subject: `🏆 Achievement Unlocked: ${newBadgesEarned.map(b => b.name).join(', ')}`,
        html: emailMessage,
      });

      console.log(`📧 Achievement email sent to ${this.email} for ${newBadgesEarned.length} new badge(s)`);
    } catch (emailError) {
      console.error('❌ Failed to send achievement email:', emailError);
      // Don't throw - badge is still awarded even if email fails
    }
  }
};

module.exports = mongoose.model('User', userSchema);
