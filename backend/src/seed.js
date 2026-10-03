const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const connectDB = require('./config/db');
const User = require('./models/User');
const SLA = require('./models/SLA');
const Ticket = require('./models/Ticket');
const Comment = require('./models/Comment');

const defaultSlas = [
  { priority: 'high', responseTimeHours: 1, resolutionTimeHours: 4 },
  { priority: 'medium', responseTimeHours: 4, resolutionTimeHours: 24 },
  { priority: 'low', responseTimeHours: 12, resolutionTimeHours: 72 },
];

async function seedSla() {
  for (const sla of defaultSlas) {
    const exists = await SLA.findOne({ priority: sla.priority });
    if (!exists) {
      await SLA.create(sla);
      console.log('SLA created for ' + sla.priority);
    }
  }
}

async function seedUsers() {
  const accounts = [
    { name: 'Admin User', email: 'admin@supportdesk.com', password: 'admin123', role: 'admin' },
    { name: 'Agent User', email: 'agent@supportdesk.com', password: 'agent123', role: 'agent' },
    { name: 'Normal User', email: 'user@supportdesk.com', password: 'user123', role: 'user' },
  ];

  for (const account of accounts) {
    const exists = await User.findOne({ email: account.email });
    if (!exists) {
      await User.create(account);
      console.log(account.role + ' created: ' + account.email);
    }
  }
}

async function seedDemoTickets() {
  const admin = await User.findOne({ role: 'admin' });
  const agent = await User.findOne({ role: 'agent' });
  const user = await User.findOne({ role: 'user' });
  if (!user || !agent) return;

  const count = await Ticket.countDocuments();
  if (count > 0) return;

  const highSla = await SLA.findOne({ priority: 'high' });
  const medSla = await SLA.findOne({ priority: 'medium' });
  const lowSla = await SLA.findOne({ priority: 'low' });

  const tickets = [
    {
      title: 'Database connection latency spike in production',
      description: 'Experiencing intermittent connection timeouts during peak traffic intervals. Connection pool saturation observed.',
      status: 'in-progress',
      priority: 'high',
      createdBy: user._id,
      assignedTo: agent._id,
      sla: highSla ? highSla._id : null,
      dueDate: new Date(Date.now() + 4 * 3600 * 1000),
      breached: false,
    },
    {
      title: 'SSO session token invalidation issue',
      description: 'Users reporting occasional 401 unauthorized errors when navigating between client dashboard tabs.',
      status: 'open',
      priority: 'medium',
      createdBy: user._id,
      assignedTo: null,
      sla: medSla ? medSla._id : null,
      dueDate: new Date(Date.now() + 24 * 3600 * 1000),
      breached: false,
    },
    {
      title: 'Update enterprise SLA reporting metrics export',
      description: 'Add support for downloading monthly incident compliance reports in PDF and CSV format.',
      status: 'resolved',
      priority: 'low',
      createdBy: user._id,
      assignedTo: agent._id,
      sla: lowSla ? lowSla._id : null,
      dueDate: new Date(Date.now() + 72 * 3600 * 1000),
      resolvedAt: new Date(),
      breached: false,
    },
  ];

  for (const t of tickets) {
    const created = await Ticket.create(t);
    console.log('Ticket created: ' + created.title);
  }

  const firstTicket = await Ticket.findOne({ title: 'Database connection latency spike in production' });
  if (firstTicket) {
    await Comment.create({
      ticket: firstTicket._id,
      user: agent._id,
      message: 'Investigating query execution times and database index coverage.',
    });
    await Comment.create({
      ticket: firstTicket._id,
      user: user._id,
      message: 'Attached telemetry charts. Please prioritize before the afternoon peak.',
    });
    console.log('Sample comments created for ticket: ' + firstTicket._id);
  }
}

async function run() {
  await connectDB();
  await seedSla();
  await seedUsers();
  await seedDemoTickets();
  console.log('Seeding done');
  process.exit(0);
}

if (require.main === module) {
  run();
}

module.exports = { seedSla, seedUsers, seedDemoTickets, run };
