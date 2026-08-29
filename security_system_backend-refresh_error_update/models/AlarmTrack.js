const mongoose = require('mongoose');

const AlarmTrackSchema = new mongoose.Schema({
  // Unique token to ensure we only keep one active track state in the database
  systemKey: { type: String, required: true, unique: true, default: "active_alarm_configuration" },
  // Stores just the simple string ID of the selected song (e.g., "industrial", "beeps")
  selectedTrackId: { type: String, required: true, default: "industrial" }
}, { timestamps: true });

module.exports = mongoose.model('AlarmTrack', AlarmTrackSchema);