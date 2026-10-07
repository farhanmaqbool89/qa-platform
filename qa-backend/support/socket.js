let io = null;
let currentExecutionId = null;

function initializeSocket(socketServer, executionId) {
  io = socketServer;
  currentExecutionId = executionId;
}

function emitEvent(payload) {
  if (io) {
    io.emit('execution-event', {
      executionId: currentExecutionId,
      timestamp: new Date().toLocaleTimeString(),
      ...payload
    });
  }
  console.log('[SOCKET_EVENT]:' + JSON.stringify(payload));
}

function getIO() {
  return io;
}

module.exports = {
  initializeSocket,
  emitEvent,
  getIO
};