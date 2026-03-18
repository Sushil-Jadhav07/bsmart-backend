const mongoose = require('mongoose');

const salesSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  bio:         { type: String, default: '' },
  territory:   { type: String, default: '' },
  target:      { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Sales', salesSchema);