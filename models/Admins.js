const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
    barangayName: { type: String, required: true, index: true },
    officialEmail: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    barangayAddress: { type: String, required: true },
    officialContact: { type: String, required: true },
    municipality: { type: String, required: true },
}, { collection: 'admins' });

module.exports = mongoose.model('Admin', AdminSchema);