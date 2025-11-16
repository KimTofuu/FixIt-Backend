const mongoose = require('mongoose');

const AuthoritySchema = new mongoose.Schema({
    authorityName: { type: String, required: true, index: true },
    department: { type: String, required: true },
    class: { 
        type: String,
        enum: ['Infrastructure', 'Utilities', 'Sanitation and Waste', 'Environment and Public Spaces', 'Community and Safety', 'Government / Administrative', 'Others', 'Default'], 
    },
    contactEmail: { type: String, required: true, index: true },
}, { collection: 'authorities' });

module.exports = mongoose.model('Authority', AuthoritySchema);