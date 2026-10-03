const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { initFirebase } = require('./src/config/firebase');
const { initSocket } = require('./src/sockets/socket');
const { markBreachedTickets } = require('./src/utils/sla');
const { seedSla, seedUsers, seedAutomations, seedDemoTickets } = require('./src/seed');

const port = process.env.PORT || 8000;

async function start() {
  await connectDB();
  initFirebase();

  try {
    await seedSla();
    await seedUsers();
    await seedAutomations();
    await seedDemoTickets();
  } catch (seedErr) {
    console.error('Seeding notice:', seedErr.message);
  }

  const server = http.createServer(app);
  initSocket(server);

  setInterval(() => {
    markBreachedTickets().catch((err) => console.log(err.message));
  }, 60000);

  server.on('error', (err) => {
    console.log(err.message);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log('Server running on port ' + port);
  });
}

start();
