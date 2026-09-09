const { Server } = require('socket.io');
const env = require('../../config/env');
const redis = require('../redis/client');
const { query } = require('../database/pool');
const { CACHE_KEYS, CACHE_TTL } = require('../../config/constants');
const { authenticateAccessToken } = require('../../middleware/auth');
const { UnauthorizedError } = require('../../shared/errors');

let ioInstance = null;
const activeUserSockets = new Map();

function isUserOnline(userId) {
  if (!userId) return false;
  return activeUserSockets.has(userId);
}

function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.cors.origin,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) {
      return next(new Error('AUTHENTICATION_REQUIRED'));
    }

    try {
      const user = await authenticateAccessToken(token);
      socket.userId = user.userId;
      return next();
    } catch (err) {
      return next(new Error(err instanceof UnauthorizedError ? 'INVALID_TOKEN' : 'AUTHENTICATION_UNAVAILABLE'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    socket.join(`user:${userId}`);

    const count = (activeUserSockets.get(userId) || 0) + 1;
    activeUserSockets.set(userId, count);

    // Update database presence and Redis cache
    query('UPDATE profiles SET last_active_at = NOW() WHERE user_id = $1', [userId]).catch(() => {});
    try {
      await redis.set(CACHE_KEYS.PRESENCE(userId), 'online', 'EX', CACHE_TTL.PRESENCE_SECONDS);
    } catch {}

    socket.on('join:conversation', async (conversationId) => {
      if (typeof conversationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(conversationId)) return;
      try {
        const membership = await query(
          'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
          [conversationId, userId]
        );
        if (membership.rows.length > 0 && socket.connected) socket.join(`conv:${conversationId}`);
      } catch { socket.emit('conversation:error', { message: 'Unable to join conversation' }); }
    });

    socket.on('leave:conversation', (conversationId) => {
      if (typeof conversationId === 'string') {
        socket.leave(`conv:${conversationId}`);
      }
    });

    socket.on('typing:start', (payload) => {
      const conversationId = payload?.conversationId;
      if (typeof conversationId === 'string' && socket.rooms.has(`conv:${conversationId}`)) {
        socket.to(`conv:${conversationId}`).emit('typing:start', {
          conversationId,
          userId,
        });
      }
    });

    socket.on('typing:stop', (payload) => {
      const conversationId = payload?.conversationId;
      if (typeof conversationId === 'string' && socket.rooms.has(`conv:${conversationId}`)) {
        socket.to(`conv:${conversationId}`).emit('typing:stop', {
          conversationId,
          userId,
        });
      }
    });

    socket.on('disconnect', async () => {
      const current = (activeUserSockets.get(userId) || 1) - 1;
      if (current <= 0) {
        activeUserSockets.delete(userId);
      } else {
        activeUserSockets.set(userId, current);
      }

      query('UPDATE profiles SET last_active_at = NOW() WHERE user_id = $1', [userId]).catch(() => {});
      try {
        if (!activeUserSockets.has(userId)) await redis.del(CACHE_KEYS.PRESENCE(userId));
      } catch {}
    });
  });

  ioInstance = io;
  return io;
}

function getIO() {
  return ioInstance;
}

function emitToUser(userId, event, data) {
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit(event, data);
  }
}

function emitToConversation(conversationId, event, data) {
  if (ioInstance) {
    ioInstance.to(`conv:${conversationId}`).emit(event, data);
  }
}

function emitToAll(event, data) {
  if (ioInstance) {
    ioInstance.emit(event, data);
  }
}

module.exports = {
  initSocketServer,
  getIO,
  emitToUser,
  emitToConversation,
  emitToAll,
  isUserOnline,
};
