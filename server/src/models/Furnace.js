const mongoose = require('mongoose');
const readingSchema = new mongoose.Schema({
  temperature: { type: Number, required: true },
  recordedAt: { type: Date, default: Date.now }
}, { _id: false });
const schema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  temperature: { type: Number, default: 0 },
  minTemperature: { type: Number, default: 1400 },
  maxTemperature: { type: Number, default: 1650 },
  status: { type: String, enum: ['NORMAL','WARNING','CRITICAL','OFFLINE'], default: 'NORMAL' },
  lastUpdated: { type: Date, default: Date.now },
  temperatureHistory: { type: [readingSchema], default: [] }
}, { timestamps: true });
module.exports = mongoose.model('Furnace', schema);
