const Ticket = require('../models/Ticket');
const User = require('../models/User');

// GET /api/admin/tickets
async function getAllTickets(req, res) {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;

    const tickets = await Ticket.find(filter)
      .populate('createdBy', 'name email role')
      .populate('assignedTo', 'name email role')
      .sort({ createdAt: -1 });

    res.json(tickets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/admin/reports
async function getReports(req, res) {
  try {
    const byStatus = await Ticket.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const byPriority = await Ticket.aggregate([
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]);

    const breachedCount = await Ticket.countDocuments({ breached: true });

    const perAgent = await Ticket.aggregate([
      { $match: { assignedTo: { $ne: null } } },
      { $group: { _id: '$assignedTo', total: { $sum: 1 }, resolved: { $sum: { $cond: ['$resolvedAt', 1, 0] } } } },
      { $sort: { total: -1 } },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'agent',
        },
      },
      { $unwind: '$agent' },
      {
        $project: {
          _id: 0,
          agentId: '$_id',
          name: '$agent.name',
          email: '$agent.email',
          total: 1,
          resolved: 1,
        },
      },
    ]);

    const statusMap = {};
    byStatus.forEach((row) => {
      statusMap[row._id] = row.count;
    });

    const priorityMap = {};
    byPriority.forEach((row) => {
      priorityMap[row._id] = row.count;
    });

    res.json({
      totalTickets: await Ticket.countDocuments(),
      byStatus: statusMap,
      byPriority: priorityMap,
      slaBreached: breachedCount,
      ticketsPerAgent: perAgent,
      users: await User.countDocuments(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/admin/db-stats
async function getDatabaseStats(req, res) {
  try {
    const Comment = require('../models/Comment');
    const SLA = require('../models/SLA');
    const mongoose = require('mongoose');

    const [userCount, ticketCount, commentCount, slaCount, slas] = await Promise.all([
      User.countDocuments(),
      Ticket.countDocuments(),
      Comment.countDocuments(),
      SLA.countDocuments(),
      SLA.find().lean(),
    ]);

    const usersByRole = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    const roleMap = {};
    usersByRole.forEach(r => { roleMap[r._id] = r.count; });

    res.json({
      database: mongoose.connection.name || 'supportdesk',
      connected: mongoose.connection.readyState === 1,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host || '127.0.0.1',
      port: mongoose.connection.port || 27017,
      collections: {
        users: userCount,
        tickets: ticketCount,
        comments: commentCount,
        slas: slaCount,
      },
      usersByRole: roleMap,
      slaPolicies: slas,
      uptimeSeconds: process.uptime(),
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getAllTickets, getReports, getDatabaseStats };

