const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const connectDB = require('./config/db');
const User = require('./models/User');
const SLA = require('./models/SLA');

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

async function run() {
  await connectDB();
  await seedSla();
  await seedUsers();
  console.log('Seeding done');
  process.exit(0);
}

if (require.main === module) {
  run();
}

module.exports = { seedSla, seedUsers, run };
