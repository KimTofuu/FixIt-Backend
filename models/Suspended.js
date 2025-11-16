const mongoose = require('mongoose');

const suspendedUserSchema = new mongoose.Schema({
  // Original user data
  originalUserId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    unique: true
  },
  fName: {
    type: String,
    required: true
  },
  lName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  address: String,
  barangay: String,
  municipality: String, // ✅ Add municipality
  contact: String,
  
  // ✅ Add profile picture
  profilePicture: {
    url: { type: String, default: '' },
    public_id: { type: String, default: '' }
  },
  
  // Reputation data
  reputation: {
    points: { type: Number, default: 0 },
    level: { type: String, default: 'Newcomer' },
    badges: [{
      name: String,
      icon: String,
      earnedAt: { type: Date, default: Date.now }
    }],
    totalReports: { type: Number, default: 0 },
    verifiedReports: { type: Number, default: 0 },
    resolvedReports: { type: Number, default: 0 },
    helpfulVotes: { type: Number, default: 0 }
  },

  // User activity data
  lastLogin: Date,
  createdAt: Date,

  // Suspension data
  suspended: {
    type: Boolean,
    default: true
  },
  suspendedAt: {
    type: Date,
    default: Date.now
  },
  suspensionReason: {
    type: String,
    required: true
  },
  suspendedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  suspensionDuration: Number, // in days, null = indefinite

  // Original account data
  originalData: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SuspendedUser', suspendedUserSchema);