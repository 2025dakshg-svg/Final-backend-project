const Automation = require('../models/Automation');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { emit } = require('../sockets/socket');

// GET /api/automations
async function getAutomations(req, res) {
  try {
    let list = await Automation.find().sort({ createdAt: -1 });
    if (!list.length) {
      // Seed default rules if empty
      list = await Automation.create([
        {
          name: 'Auto-Assign High Severity Incidents',
          trigger: 'on_ticket_create',
          action: 'auto_assign_high_priority',
          isActive: true,
        },
        {
          name: 'Auto-Escalate SLA Breached Tickets',
          trigger: 'on_sla_breach',
          action: 'escalate_breach',
          isActive: true,
        },
        {
          name: 'Auto-Close Inactive Resolved Tickets',
          trigger: 'scheduled_cleanup',
          action: 'auto_close_resolved',
          isActive: true,
        },
      ]);
    }
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// POST /api/automations
async function createAutomation(req, res) {
  try {
    const { name, trigger, action, isActive } = req.body;
    const rule = await Automation.create({
      name,
      trigger,
      action,
      isActive: isActive !== undefined ? isActive : true,
    });
    res.status(201).json(rule);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// POST /api/automations/run
async function runAutomations(req, res) {
  try {
    const results = [];

    // 1. Auto-assign high priority tickets with no agent
    const agents = await User.find({ role: 'agent' });
    if (agents.length > 0) {
      const unassignedHigh = await Ticket.find({
        priority: 'high',
        assignedTo: null,
        status: { $in: ['open', 'in-progress'] },
      });

      for (let i = 0; i < unassignedHigh.length; i++) {
        const assignedAgent = agents[i % agents.length];
        unassignedHigh[i].assignedTo = assignedAgent._id;
        if (unassignedHigh[i].status === 'open') {
          unassignedHigh[i].status = 'in-progress';
        }
        await unassignedHigh[i].save();
        emit('ticket:assigned', unassignedHigh[i]);
        results.push(
          `Auto-assigned high priority ticket ${unassignedHigh[i]._id} to agent ${assignedAgent.name}`
        );
      }
    }

    // 2. Auto-close tickets resolved > 48h ago
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const resolvedOld = await Ticket.find({
      status: 'resolved',
      resolvedAt: { $lte: twoDaysAgo },
    });

    for (const t of resolvedOld) {
      t.status = 'closed';
      await t.save();
      emit('ticket:status', t);
      results.push(`Auto-closed resolved ticket ${t._id}`);
    }

    res.json({
      executed: true,
      timestamp: new Date().toISOString(),
      actionsPerformed: results.length,
      details: results,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = {
  getAutomations,
  createAutomation,
  runAutomations,
};
