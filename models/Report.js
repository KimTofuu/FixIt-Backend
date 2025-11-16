const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },
  latitude: {
    type: String,
  },
  longitude: {
    type: String,
  },
  images: [{ type: String }],
  image: { type: String },
  status: {
    type: String,
    enum: ['awaiting-approval', 'pending', 'in-progress', 'resolved'],
    default: 'Reported',
  },
  priority: {
    type: String,
    enum: ['urgent', 'not urgent'],
    default: 'not urgent',
  },
  // Reputation related fields
  isVerified: {
    type: Boolean,
    default: false,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  verifiedAt: {
    type: Date,
  },
  helpfulVotes: {
    type: Number,
    default: 0,
  },
  votedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: []
  }],
  comments: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    user: String,
    fName: String,
    lName: String,
    email: String,
    barangay: String,
    municipality: String,
    profilePicture: String,
    text: String,
    createdAt: { type: Date, default: Date.now },
    editedAt: { type: Date, default: null },
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  flags: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reason: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ''
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  flagCount: {
    type: Number,
    default: 0
  },
  forwardedTo: [{
    authorityEmail: String,
    authorityName: String,
    forwardedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    forwardedAt: { type: Date, default: Date.now }
  }],
}, {
  timestamps: true
});

module.exports = mongoose.model('Report', reportSchema);