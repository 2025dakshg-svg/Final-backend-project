const Comment = require('../models/Comment');
const Ticket = require('../models/Ticket');
const { emitToRoom, emit } = require('../sockets/socket');

async function checkAccess(ticketId, user) {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) return null;

  if (user.role === 'admin') return ticket;
  if (user.role === 'user' && ticket.createdBy.toString() === user._id.toString()) return ticket;
  if (user.role === 'agent' && (!ticket.assignedTo || ticket.assignedTo.toString() === user._id.toString())) return ticket;

  return false;
}

// POST /api/comments
async function addComment(req, res) {
  try {
    const { ticketId, message } = req.body;

    const allowed = await checkAccess(ticketId, req.user);
    if (allowed === null) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    if (allowed === false) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const comment = await Comment.create({
      ticket: ticketId,
      user: req.user._id,
      message: message,
    });

    const fullComment = await Comment.findById(comment._id)
      .populate('user', 'name email role')
      .populate('ticket', 'title status');

    emit('comment:new', fullComment);
    emitToRoom('ticket:' + ticketId, 'comment:new', fullComment);

    res.status(201).json(fullComment);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// GET /api/comments  (comments made by the logged in user)
async function getMyComments(req, res) {
  try {
    const comments = await Comment.find({ user: req.user._id })
      .populate('user', 'name email role')
      .populate('ticket', 'title status')
      .sort({ createdAt: -1 });

    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/comments/ticket/:id
async function getTicketComments(req, res) {
  try {
    const allowed = await checkAccess(req.params.id, req.user);
    if (allowed === null) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    if (allowed === false) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const comments = await Comment.find({ ticket: req.params.id })
      .populate('user', 'name email role')
      .sort({ createdAt: 1 });

    res.json(comments);
  } catch (err) {
    res.status(400).json({ message: 'Invalid id' });
  }
}

module.exports = { addComment, getMyComments, getTicketComments };
