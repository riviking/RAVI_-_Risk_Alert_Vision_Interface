// models/Layout.js
const mongoose = require('mongoose');

// Define individual sensor mapping criteria
const SensorSchema = new mongoose.Schema({
  id: { type: Number, required: true },        
  roomName: { type: String, required: true }, 
  sensorId: { type: String, required: true }, // Links to physical ESP32 data
  x: { type: Number, required: true },        
  y: { type: Number, required: true }         
});

// Define individual sub-floor metadata sheets
const FloorSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  name: { type: String, required: true },
  image: { type: String, required: true }, 
  sensors: [SensorSchema]                 
});

// Define core building structures
const BuildingSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  name: { type: String, required: true },
  x: { type: Number, required: true },        
  y: { type: Number, required: true },        
  floors: [FloorSchema]                   
});

// Define the Master Layout Configuration Map
const LayoutSchema = new mongoose.Schema({
  masterPlanImage: { type: String, default: null }, 
  infrastructure: [BuildingSchema],                  
  updatedAt: { type: Date, default: Date.now }
});

// 🚀 MIDDLEWARE: Automatically update timestamp before saving
// This ensures that whenever you delete or edit infrastructure, 
// the 'updatedAt' field accurately reflects the change.
LayoutSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Layout', LayoutSchema);