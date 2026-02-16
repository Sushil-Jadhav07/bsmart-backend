const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  bio: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Member', memberSchema);
