const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const connectDB = require('./config/db');
const User = require('./models/User');
const SLA = require('./models/SLA');
const Ticket = require('./models/Ticket');
const Comment = require('./models/Comment');
const Automation = require('./models/Automation');

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
    { name: 'Daksh Ghandat (Lead Admin)', email: 'daksh.admin@supportdesk.com', password: 'admin123', role: 'admin' },
    { name: 'Admin User', email: 'admin@supportdesk.com', password: 'admin123', role: 'admin' },
    { name: 'Priya Sharma (Senior Support)', email: 'priya.sharma@supportdesk.com', password: 'agent123', role: 'agent' },
    { name: 'Rohan Verma (DevOps Specialist)', email: 'rohan.verma@supportdesk.com', password: 'agent123', role: 'agent' },
    { name: 'Agent User', email: 'agent@supportdesk.com', password: 'agent123', role: 'agent' },
    { name: 'Sarah Jenkins (Operations Lead)', email: 'sarah.jenkins@company.com', password: 'user123', role: 'user' },
    { name: 'Vikram Patel (Product Analyst)', email: 'vikram.patel@company.com', password: 'user123', role: 'user' },
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

async function seedAutomations() {
  const rules = [
    {
      name: 'Escalate High-Priority Tickets on SLA Breach',
      trigger: 'on_sla_breach',
      action: 'escalate_breach',
      isActive: true,
    },
    {
      name: 'Auto-Assign High-Priority Tickets to Senior Support',
      trigger: 'on_ticket_create',
      action: 'auto_assign_high_priority',
      isActive: true,
    },
    {
      name: 'Auto-Close Inactive Resolved Tickets after Verification',
      trigger: 'scheduled_cleanup',
      action: 'auto_close_resolved',
      isActive: true,
    },
  ];

  for (const rule of rules) {
    const exists = await Automation.findOne({ name: rule.name });
    if (!exists) {
      await Automation.create(rule);
      console.log('Automation rule created: ' + rule.name);
    }
  }
}

async function seedDemoTickets() {
  const admin = await User.findOne({ email: 'admin@supportdesk.com' }) || await User.findOne({ role: 'admin' });
  const agentPriya = await User.findOne({ email: 'priya.sharma@supportdesk.com' }) || await User.findOne({ role: 'agent' });
  const agentRohan = await User.findOne({ email: 'rohan.verma@supportdesk.com' }) || agentPriya;
  const userSarah = await User.findOne({ email: 'sarah.jenkins@company.com' }) || await User.findOne({ role: 'user' });
  const userVikram = await User.findOne({ email: 'vikram.patel@company.com' }) || userSarah;

  if (!userSarah || !agentPriya) return;

  const highSla = await SLA.findOne({ priority: 'high' });
  const medSla = await SLA.findOne({ priority: 'medium' });
  const lowSla = await SLA.findOne({ priority: 'low' });

  const tickets = [
    {
      title: 'Production API Gateway 504 Timeout during batch invoice sync',
      description: 'Downstream microservice latency increased beyond 15,000ms causing HTTP 504 timeouts on /api/v1/billing/sync. Upstream connection pool saturated on node-02.',
      status: 'in-progress',
      priority: 'high',
      createdBy: userSarah._id,
      assignedTo: agentPriya._id,
      sla: highSla ? highSla._id : null,
      dueDate: new Date(Date.now() + 3 * 3600 * 1000),
      breached: false,
      attachments: [
        {
          filename: 'gateway_access_log_trace.json',
          fileUrl: '/public/sample-trace.json',
          fileType: 'application/json',
          sizeBytes: 48210,
          uploadedBy: userSarah._id,
          uploadedAt: new Date(Date.now() - 3600 * 1000),
        },
      ],
    },
    {
      title: 'Redis cluster shard-01 memory utilization exceeded 92%',
      description: 'Eviction rate spike detected across cluster shard-01. Volatile-LRU eviction policy actively dumping cache records, resulting in direct read load spikes on primary MongoDB replica set.',
      status: 'open',
      priority: 'high',
      createdBy: userVikram._id,
      assignedTo: agentRohan._id,
      sla: highSla ? highSla._id : null,
      dueDate: new Date(Date.now() - 2 * 3600 * 1000), // Overdue to demonstrate SLA breach
      breached: true,
    },
    {
      title: 'Single Sign-On SAML token expiration renewal failure',
      description: 'Enterprise users authenticating via corporate Okta SSO receive unexpected 401 unauthorized errors when idle for over 45 minutes instead of the configured 8-hour session window.',
      status: 'open',
      priority: 'medium',
      createdBy: userSarah._id,
      assignedTo: null,
      sla: medSla ? medSla._id : null,
      dueDate: new Date(Date.now() + 18 * 3600 * 1000),
      breached: false,
    },
    {
      title: 'PostgreSQL connection pool exhaustion during night reconciliation',
      description: 'Batch automated reconciliation job opened 120 idle connections without closing connection handles, blocking interactive analytics queries on the replica database.',
      status: 'resolved',
      priority: 'medium',
      createdBy: userVikram._id,
      assignedTo: agentPriya._id,
      sla: medSla ? medSla._id : null,
      dueDate: new Date(Date.now() - 5 * 3600 * 1000),
      resolvedAt: new Date(Date.now() - 2 * 3600 * 1000),
      breached: false,
    },
    {
      title: 'Update TLS cipher suites on external application load balancers',
      description: 'Quarterly infosec vulnerability assessment recommendation: deprecate TLS 1.0/1.1 and enforce modern ECDHE-RSA-AES128-GCM-SHA256 cipher suites across all public ingress gateways.',
      status: 'closed',
      priority: 'low',
      createdBy: admin._id,
      assignedTo: agentRohan._id,
      sla: lowSla ? lowSla._id : null,
      dueDate: new Date(Date.now() - 48 * 3600 * 1000),
      resolvedAt: new Date(Date.now() - 24 * 3600 * 1000),
      breached: false,
    },
  ];

  for (const t of tickets) {
    const existing = await Ticket.findOne({ title: t.title });
    if (!existing) {
      const created = await Ticket.create(t);
      console.log('Ticket created: ' + created.title);

      if (t.title.includes('504 Timeout')) {
        await Comment.create({
          ticket: created._id,
          user: userSarah._id,
          message: 'Telemetry trace attached. Invoice generation queue has 420 pending jobs waiting for acknowledgement.',
        });
        await Comment.create({
          ticket: created._id,
          user: agentPriya._id,
          message: 'Investigating downstream database lock contention. Restarting worker container #3 with increased timeout window.',
        });
      }

      if (t.title.includes('PostgreSQL')) {
        await Comment.create({
          ticket: created._id,
          user: agentPriya._id,
          message: 'Configured connection pool max_connections cap to 40 with idle timeout 15000ms. Validated overnight run without leaks.',
        });
      }
    }
  }
}

async function run() {
  await connectDB();
  await seedSla();
  await seedUsers();
  await seedAutomations();
  await seedDemoTickets();
  console.log('Seeding done');
  process.exit(0);
}

if (require.main === module) {
  run();
}

module.exports = { seedSla, seedUsers, seedAutomations, seedDemoTickets, run };
