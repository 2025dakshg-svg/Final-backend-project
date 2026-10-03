const { Server } = require('socket.io');

let io = null;

function initSocket(server) {
  io = new Server(server, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    console.log('Socket connected: ' + socket.id);

    // client can pass its jwt so rooms stay per user
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (token) {
      socket.join('user:' + token.slice(-12));
    }

    socket.on('joinTicket', (ticketId) => {
      socket.join('ticket:' + ticketId);
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected: ' + socket.id);
    });
  });
}

function emit(event, data) {
  if (!io) return;
  io.emit(event, data);
}

function emitToRoom(room, event, data) {
  if (!io) return;
  io.to(room).emit(event, data);
}

module.exports = { initSocket, emit, emitToRoom };
