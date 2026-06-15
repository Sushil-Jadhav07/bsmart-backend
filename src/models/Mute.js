const mongoose = require('mongoose');

const muteSchema = new mongoose.Schema({
  muter_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  muted_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now },
});

muteSchema.index({ muter_id: 1, muted_id: 1 }, { unique: true });

module.exports = mongoose.model('Mute', muteSchema);
