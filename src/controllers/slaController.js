const SLA = require('../models/SLA');
const Ticket = require('../models/Ticket');

// GET /api/sla
async function getSlas(req, res) {
  try {
    const slas = await SLA.find().sort({ resolutionTimeHours: 1 });
    res.json(slas);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// PUT /api/sla/:id
async function updateSla(req, res) {
  try {
    const { responseTimeHours, resolutionTimeHours } = req.body;

    const sla = await SLA.findById(req.params.id);
    if (!sla) {
      return res.status(404).json({ message: 'SLA not found' });
    }

    if (responseTimeHours) sla.responseTimeHours = responseTimeHours;
    if (resolutionTimeHours) sla.resolutionTimeHours = resolutionTimeHours;

    const saved = await sla.save();

    // tickets that are still open follow the new time
    if (resolutionTimeHours) {
      const due = new Date();
      due.setHours(due.getHours() + resolutionTimeHours);

      await Ticket.updateMany(
        { sla: saved._id, status: { $nin: ['resolved', 'closed'] } },
        { dueDate: due, breached: false }
      );
    }

    res.json(saved);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

module.exports = { getSlas, updateSla };
