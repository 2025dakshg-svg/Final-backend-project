const mongoose = require('mongoose');

const automationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    trigger: {
      type: String,
      enum: ['on_ticket_create', 'on_sla_breach', 'scheduled_cleanup'],
      default: 'on_ticket_create',
    },
    action: {
      type: String,
      enum: ['auto_assign_high_priority', 'auto_close_resolved', 'escalate_breach'],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Automation', automationSchema);
