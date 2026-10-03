const mongoose = require('mongoose');

const slaSchema = new mongoose.Schema({
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    required: true,
    unique: true,
  },
  responseTimeHours: {
    type: Number,
    required: true,
  },
  resolutionTimeHours: {
    type: Number,
    required: true,
  },
});

module.exports = mongoose.model('SLA', slaSchema);
