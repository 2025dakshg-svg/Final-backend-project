const Ticket = require('../models/Ticket');
const { emit, emitToRoom } = require('../sockets/socket');

// POST /api/tickets/:id/attachments
async function addAttachment(req, res) {
  try {
    const { filename, fileUrl, fileType, sizeBytes } = req.body;

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const attachment = {
      filename: filename || 'attachment_' + Date.now(),
      fileUrl: fileUrl || '/public/sample-attachment.txt',
      fileType: fileType || 'application/octet-stream',
      sizeBytes: sizeBytes || 1024,
      uploadedBy: req.user._id,
      uploadedAt: new Date(),
    };

    ticket.attachments.push(attachment);
    await ticket.save();

    const created = ticket.attachments[ticket.attachments.length - 1];

    emit('ticket:attachment', {
      ticketId: ticket._id,
      attachment: created,
    });
    emitToRoom('ticket:' + ticket._id, 'ticket:attachment', {
      ticketId: ticket._id,
      attachment: created,
    });

    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

// GET /api/tickets/:id/attachments
async function getAttachments(req, res) {
  try {
    const ticket = await Ticket.findById(req.params.id).populate('attachments.uploadedBy', 'name email role');
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json(ticket.attachments || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// DELETE /api/tickets/:id/attachments/:attachmentId
async function deleteAttachment(req, res) {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const attIndex = ticket.attachments.findIndex(
      (a) => a._id.toString() === req.params.attachmentId
    );
    if (attIndex === -1) {
      return res.status(404).json({ message: 'Attachment not found' });
    }

    const att = ticket.attachments[attIndex];
    if (
      req.user.role === 'user' &&
      att.uploadedBy &&
      att.uploadedBy.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized to delete this attachment' });
    }

    ticket.attachments.splice(attIndex, 1);
    await ticket.save();

    res.json({ message: 'Attachment removed successfully' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

module.exports = {
  addAttachment,
  getAttachments,
  deleteAttachment,
};
