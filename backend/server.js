const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');
const { Firestore } = require('@google-cloud/firestore');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { path: '/ws' });
const firestore = new Firestore();

// Rate limiting for REST endpoints (optional)
app.use(rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
}));

// In-memory user presence tracking
let onlineUsers = {};

io.on('connection', (socket) => {
  let sessionId, userId;

  socket.on('joinSession', (data) => {
    sessionId = data.sessionId;
    userId = data.userId;
    if (!onlineUsers[sessionId]) onlineUsers[sessionId] = [];
    if (!onlineUsers[sessionId].includes(userId)) onlineUsers[sessionId].push(userId);

    // Broadcast updated user list
    io.to(sessionId).emit('existingPeers', {
      sessionId,
      peers: onlineUsers[sessionId].filter(id => id !== userId),
      users: onlineUsers[sessionId]
    });

    socket.join(sessionId);
    // Audit log
    firestore.collection('auditLogs').add({
      type: 'joinSession',
      userId,
      sessionId,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('codeChange', (data) => {
    // Rate limit per user (simple example)
    if (!socket.lastCodeChange || Date.now() - socket.lastCodeChange > 500) {
      socket.lastCodeChange = Date.now();
      // Backend sanitization
      const safeCode = sanitizeHtml(data.code, { allowedTags: [], allowedAttributes: {} });
      // Broadcast sanitized code
      io.to(data.sessionId).emit('codeUpdate', { sessionId: data.sessionId, code: safeCode });
      // Audit log
      firestore.collection('auditLogs').add({
        type: 'codeChange',
        userId: data.userId,
        sessionId: data.sessionId,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('disconnect', () => {
    if (sessionId && userId && onlineUsers[sessionId]) {
      onlineUsers[sessionId] = onlineUsers[sessionId].filter(id => id !== userId);
      io.to(sessionId).emit('existingPeers', {
        sessionId,
        peers: onlineUsers[sessionId],
        users: onlineUsers[sessionId]
      });
      // Audit log
      firestore.collection('auditLogs').add({
        type: 'disconnect',
        userId,
        sessionId,
        timestamp: new Date().toISOString()
      });
    }
  });
});

server.listen(process.env.PORT || 3001, () => {
  console.log('Socket.IO server running');
});