const mongoose = require('mongoose');

const FireSchema = new mongoose.Schema({
  // Expressly uses the custom hardware tracking strings as the Document Id mapping
  _Id: { type: String, required: true },
  temp: { type: Number, required: true },
  hum: { type: Number, required: true },
  fire: { type: Boolean, default: false },
  robbery: { type: Boolean, default: false },
  
  // 🌟 Added explicitly to support the 1-hour snooze matrix windows
  snoozedUntilFire: { type: Date, default: null },
  snoozedUntilRobbery: { type: Date, default: null },

  // Real-time network heartbeats and metadata updates
  last_seen: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Fire', FireSchema);