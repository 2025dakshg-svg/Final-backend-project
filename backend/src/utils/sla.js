const SLA = require('../models/SLA');
const Ticket = require('../models/Ticket');

// high = 4h, medium = 24h, low = 72h are the defaults used when an
// sla record is missing for a priority
const fallbackHours = { high: 4, medium: 24, low: 72 };

async function getSlaForPriority(priority) {
  const sla = await SLA.findOne({ priority: priority });
  if (sla) return sla;

  const hours = fallbackHours[priority] || 24;
  return new SLA({ priority: priority, responseTimeHours: hours, resolutionTimeHours: hours });
}

function getDueDate(sla) {
  const due = new Date();
  due.setHours(due.getHours() + sla.resolutionTimeHours);
  return due;
}

// called every minute from server.js
async function markBreachedTickets() {
  const tickets = await Ticket.find({
    dueDate: { $lt: new Date() },
    status: { $nin: ['resolved', 'closed'] },
    breached: false,
  }).populate('createdBy', 'name');

  for (const ticket of tickets) {
    ticket.breached = true;
    await ticket.save();
    console.log('SLA breached on ticket ' + ticket._id);
  }

  return tickets;
}

module.exports = { getSlaForPriority, getDueDate, markBreachedTickets };
