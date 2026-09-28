const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { getSlaForPriority, getDueDate } = require('../utils/sla');
const { emit, emitToRoom } = require('../sockets/socket');
const firebase = require('../config/firebase');

// users see their own tickets, agents see assigned and open ones, admin sees all
function buildFilter(user, query) {
  const filter = {};

  if (user.role === 'user') {
    filter.createdBy = user._id;
  } else if (user.role === 'agent') {
    filter.$or = [{ assignedTo: user._id }, { assignedTo: null }];
  }

  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;

  return filter;
}

async function canView(ticket, user) {
  if (user.role === 'admin') return true;
  if (user.role === 'user') return ticket.createdBy.toString() === user._id.toString();
  return !ticket.assignedTo || ticket.assignedTo.toString() === user._id.toString();
}

// GET /api/tickets
async function getTickets(req, res) {
  try {
    const filter = buildFilter(req.user, req.query);

    const tickets = await Ticket.find(filter)
      .populate('createdBy', 'name email role')
      .populate('assignedTo', 'name email role')
      .populate('sla', 'priority responseTimeHours resolutionTimeHours')
      .sort({ createdAt: -1 });

    res.json(tickets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/tickets/:id
async function getTicketById(req, res) {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('assignedTo', 'name email role')
      .populate('sla', 'priority responseTimeHours resolutionTimeHours');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const allowed = await canView(ticket, req.user);
    if (!allowed) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: 'Invalid id' });
  }
}

// POST /api/tickets
async function createTicket(req, res) {
  try {
    const { title, description, priority } = req.body;
    const chosenPriority = priority || 'medium';

    const sla = await getSlaForPriority(chosenPriority);

    const ticket = await Ticket.create({
      title: title,
      description: description,
      priority: chosenPriority,
      createdBy: req.user._id,
      sla: sla._id,
      dueDate: getDueDate(sla),
    });

    const fullTicket = await Ticket.findById(ticket._id)
      .populate('createdBy', 'name email role')
      .populate('assignedTo', 'name email role');

    emit('ticket:created', fullTicket);
    res.status(201).json(fullTicket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// PUT /api/tickets/:id
async function updateTicket(req, res) {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const isOwner = ticket.createdBy.toString() === req.user._id.toString();
    if (req.user.role === 'user' && !isOwner) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (req.user.role === 'agent' && !isOwner && ticket.assignedTo && ticket.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { title, description, priority } = req.body;

    if (title) ticket.title = title;
    if (description) ticket.description = description;
    if (priority && priority !== ticket.priority) {
      ticket.priority = priority;
      const sla = await getSlaForPriority(priority);
      ticket.sla = sla._id;
      if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
        ticket.dueDate = getDueDate(sla);
        ticket.breached = false;
      }
    }

    const saved = await ticket.save();

    const fullTicket = await Ticket.findById(saved._id)
      .populate('createdBy', 'name email role')
      .populate('assignedTo', 'name email role');

    emit('ticket:updated', fullTicket);
    emitToRoom('ticket:' + ticket._id, 'ticket:updated', fullTicket);
    res.json(fullTicket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// DELETE /api/tickets/:id
async function deleteTicket(req, res) {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const isOwner = ticket.createdBy.toString() === req.user._id.toString();
    if (req.user.role === 'user' && !isOwner) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await ticket.deleteOne();
    emit('ticket:deleted', { _id: ticket._id });
    res.json({ message: 'Ticket deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// PUT /api/tickets/:id/status
async function updateStatus(req, res) {
  try {
    const { status } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    ticket.status = status;
    if (status === 'resolved') {
      ticket.resolvedAt = new Date();
    }

    const saved = await ticket.save();

    const fullTicket = await Ticket.findById(saved._id)
      .populate('createdBy', 'name email role')
      .populate('assignedTo', 'name email role');

    emit('ticket:status', fullTicket);
    emitToRoom('ticket:' + ticket._id, 'ticket:status', fullTicket);
    res.json(fullTicket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// PUT /api/tickets/:id/assign
async function assignTicket(req, res) {
  try {
    const { agentId } = req.body;

    const agent = await User.findById(agentId);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    if (agent.role !== 'agent' && agent.role !== 'admin') {
      return res.status(400).json({ message: 'User is not an agent' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    ticket.assignedTo = agent._id;
    if (ticket.status === 'open') {
      ticket.status = 'in-progress';
    }

    const saved = await ticket.save();

    const fullTicket = await Ticket.findById(saved._id)
      .populate('createdBy', 'name email role')
      .populate('assignedTo', 'name email role');

    emit('ticket:assigned', fullTicket);
    emitToRoom('ticket:' + ticket._id, 'ticket:assigned', fullTicket);

    if (agent.fcmToken) {
      try {
        await firebase.sendPushToToken(
          agent.fcmToken,
          'New ticket assigned',
          ticket.title,
          { ticketId: String(ticket._id) }
        );
        console.log('Push notification sent to ' + agent.email);
      } catch (err) {
        console.log('Push notification failed: ' + err.message);
      }
    } else {
      console.log('No fcm token for ' + agent.email + ', push skipped');
    }

    res.json(fullTicket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

module.exports = {
  getTickets,
  getTicketById,
  createTicket,
  updateTicket,
  deleteTicket,
  updateStatus,
  assignTicket,
};
