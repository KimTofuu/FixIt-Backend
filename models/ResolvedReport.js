const mongoose = require('mongoose');

const ResolvedReportSchema = new mongoose.Schema({
  originalReportId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true,
    index: true 
  },
  title: { 
    type: String, 
    required: true, 
    index: true 
  },
  description: { 
    type: String, 
    required: true, 
    index: true 
  },
  category: { 
    type: String, 
    required: true,
    index: true 
  },
  image: { 
    type: String, 
    index: true 
  },
  images: [{ 
    type: String 
  }],
  videos: [{ 
    type: String 
  }],
  location: { 
    type: String, 
    required: true, 
    index: true 
  },
  latitude: { 
    type: String, 
    index: true 
  },
  longitude: { 
    type: String, 
    index: true 
  },
  isUrgent: {
    type: Boolean,
    default: false,
  },
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  comments: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    user: { type: String },
    fName: { type: String },
    lName: { type: String },
    email: { type: String },
    barangay: { type: String },
    municipality: { type: String },
    profilePicture: { type: String },
    text: { type: String },
    createdAt: { type: Date, default: Date.now },
    editedAt: { type: Date, default: null }
  }],
  resolvedAt: { 
    type: Date, 
    default: Date.now 
  },
  createdAt: { 
    type: Date, 
    required: true 
  },
  updatedAt: { 
    type: Date 
  },
}, { 
  collection: 'resolvedReports',
  timestamps: false // We manually manage timestamps
});

module.exports = mongoose.model('ResolvedReport', ResolvedReportSchema);