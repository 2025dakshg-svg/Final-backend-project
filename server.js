require('dotenv').config();

const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { initFirebase } = require('./src/config/firebase');
const { initSocket } = require('./src/sockets/socket');
const { markBreachedTickets } = require('./src/utils/sla');
const { seedSla } = require('./src/seed');

const port = process.env.PORT || 8000;

async function start() {
  await connectDB();
  initFirebase();

  await seedSla();

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
