const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, default: 'kg' },
  minimumLevel: { type: Number, default: 100, min: 0 },
  supplier: { type: String, default: '' }
}, { timestamps: true });
module.exports = mongoose.model('RawMaterial', schema);
