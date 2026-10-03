const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline, Transform } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);

const app = express();
app.use(cors());

const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-party-'));
// The app accepts up to 10 GiB by default. Set MAX_VIDEO_BYTES on the server
// to choose another limit; actual host disk/proxy limits still apply.
const MAX_VIDEO_BYTES = Number(process.env.MAX_VIDEO_BYTES) || 10 * 1024 * 1024 * 1024;
const safeUnlink = (filePath) => filePath && fs.promises.unlink(filePath).catch(() => {});

app.post('/api/rooms/:roomId/video', async (req, res) => {
  const room = rooms[req.params.roomId];
  const requester = room?.participants.find((p) => p.id === req.get('x-socket-id'));
  if (!room || !requester || !['Host', 'Moderator'].includes(requester.role)) {
    return res.status(403).json({ error: 'Only the host or a moderator can upload a video.' });
  }
  const contentLength = Number(req.get('content-length'));
  const contentType = req.get('content-type') || '';
  if (!contentType.startsWith('video/') || !Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_VIDEO_BYTES) {
    return res.status(400).json({ error: 'Choose a video file no larger than the configured upload limit.' });
  }
  const mediaId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const filePath = path.join(uploadRoot, mediaId);
  let uploadedBytes = 0;
  const sizeGuard = new Transform({
    transform(chunk, encoding, callback) {
      uploadedBytes += chunk.length;
      if (uploadedBytes > MAX_VIDEO_BYTES) callback(new Error('Upload exceeds the configured size limit.'));
      else callback(null, chunk);
    }
  });
  try {
    await pipelineAsync(req, sizeGuard, fs.createWriteStream(filePath, { flags: 'wx' }));
    if (uploadedBytes !== contentLength) throw new Error('Upload size did not match Content-Length.');
    if (rooms[req.params.roomId] !== room) {
      await safeUnlink(filePath);
      return res.status(410).json({ error: 'The room has ended.' });
    }
    if (room.mediaPath) await safeUnlink(room.mediaPath);
    room.mediaPath = filePath;
    room.mediaId = mediaId;
    room.mediaType = contentType;
    room.mediaUrl = `/api/rooms/${encodeURIComponent(room.roomId)}/video/${mediaId}`;
    room.videoId = null;
    room.currentTime = 0;
    room.isPlaying = false;
    io.to(room.roomId).emit('change_video', { mediaUrl: room.mediaUrl, mediaType: contentType });
    res.json({ mediaUrl: room.mediaUrl, mediaType: contentType });
  } catch (error) {
    await safeUnlink(filePath);
    if (!res.headersSent) res.status(400).json({ error: 'Video upload failed.' });
  }
});

app.get('/api/rooms/:roomId/video/:mediaId', (req, res) => {
  const room = rooms[req.params.roomId];
  if (!room || room.mediaId !== req.params.mediaId || !room.mediaPath) return res.sendStatus(404);
  res.setHeader('Content-Type', room.mediaType || 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  const stat = fs.statSync(room.mediaPath);
  const range = req.headers.range;
  if (range) {
    const [startText, endText] = range.replace(/bytes=/, '').split('-');
    const start = Number(startText);
    const end = endText ? Math.min(Number(endText), stat.size - 1) : stat.size - 1;
    if (!Number.isInteger(start) || start < 0 || start > end) return res.sendStatus(416);
    res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(room.mediaPath, { start, end }).pipe(res);
  } else {
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(room.mediaPath).pipe(res);
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', 
    methods: ['GET', 'POST']
  }
});

// ==========================================
// IN-MEMORY DATA ENGINE (Replaces MongoDB)
// ==========================================
const rooms = {}; 

const DEFAULT_VIDEO_ID = 'a18py61_F_w'; 

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle User Joining
  socket.on('join_room', ({ roomId, username }) => {
    socket.join(roomId);

    // If room doesn't exist in memory store, initialize it
    if (!rooms[roomId]) {
      rooms[roomId] = {
        roomId,
        videoId: DEFAULT_VIDEO_ID,
        mediaUrl: null,
        mediaType: null,
        mediaPath: null,
        mediaId: null,
        isPlaying: false,
        currentTime: 0,
        participants: [],
        messages: []
      };
    }

    const room = rooms[roomId];

    // First person to join becomes Host
    const role = room.participants.length === 0 ? 'Host' : 'Participant';
    const cleanUsername = username || `Guest_${socket.id.substring(0, 4)}`;

    // Add to participant tracking map
    room.participants.push({ id: socket.id, username: cleanUsername, role });

    // Sync state back to the user including saved history messages
    socket.emit('sync_state', {
      videoId: room.videoId,
      mediaUrl: room.mediaUrl,
      mediaType: room.mediaType,
      isPlaying: room.isPlaying,
      currentTime: room.currentTime,
      myRole: role,
      myId: socket.id
    });

    // Send chat history directly to the user who just connected
    room.messages.forEach((msg) => {
      socket.emit('receive_message', { id: msg.id, sender: msg.sender, text: msg.text });
    });

    io.to(roomId).emit('user_joined', { participants: room.participants });
  });

  // Play Video
  socket.on('play', ({ roomId, time }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.isPlaying = true;
    if (time !== undefined) room.currentTime = time;
    
    socket.to(roomId).emit('play');
  });

  // Pause Video
  socket.on('pause', ({ roomId, time }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.isPlaying = false;
    if (time !== undefined) room.currentTime = time;

    socket.to(roomId).emit('pause');
  });

  // Regular Seek
  socket.on('seek', ({ roomId, time }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.currentTime = time;
    socket.to(roomId).emit('seek', { time });
  });

  // Force Seek
  socket.on('force_seek', ({ roomId, time }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.currentTime = time;
    io.to(roomId).emit('force_seek', { time });
  });

  // Room Heartbeat Tracking
  socket.on('time_heartbeat', ({ roomId, time, isPlaying }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (time !== undefined) {
      room.currentTime = time;
      room.isPlaying = isPlaying;
      socket.to(roomId).emit('host_heartbeat_stream', { time, isPlaying });
    }
  });

  // Change Video URL
  socket.on('change_video', ({ roomId, videoId }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.videoId = videoId;
    room.mediaUrl = null;
    room.mediaType = null;
    if (room.mediaPath) safeUnlink(room.mediaPath);
    room.mediaPath = null;
    room.mediaId = null;
    room.currentTime = 0;
    io.to(roomId).emit('change_video', { videoId });
  });

  // Send & Save Chat Message
  socket.on('send_message', ({ roomId, text }) => {
    const room = rooms[roomId];
    if (!room) return;

    const user = room.participants.find(p => p.id === socket.id);
    const senderName = user ? user.username : 'Unknown';

    const uniqueMsgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const newMsg = { id: uniqueMsgId, sender: senderName, text };
    
    room.messages.push(newMsg);

    io.to(roomId).emit('receive_message', {
      id: newMsg.id,
      sender: newMsg.sender,
      text: newMsg.text
    });
  });

  // Assign Moderator Roles
  socket.on('assign_role', ({ roomId, targetUserId, newRole }) => {
    const room = rooms[roomId];
    if (!room) return;

    const requester = room.participants.find(p => p.id === socket.id);
    if (!requester || requester.role !== 'Host') return;

    const target = room.participants.find(p => p.id === targetUserId);
    if (target && target.role !== 'Host') { 
      target.role = newRole;

      io.to(roomId).emit('role_assigned', { participants: room.participants });
      io.to(targetUserId).emit('role_updated_self', { newRole });
    }
  });

  // Kick Participant
  socket.on('remove_participant', ({ roomId, targetUserId }) => {
    const room = rooms[roomId];
    if (!room) return;

    const requester = room.participants.find(p => p.id === socket.id);
    if (!requester || requester.role !== 'Host') return;

    io.to(targetUserId).emit('kicked');
    
    room.participants = room.participants.filter(p => p.id !== targetUserId);
    io.to(roomId).emit('participant_removed', { participants: room.participants });
  });

  // Transfer Ownership
  socket.on('transfer_host', ({ roomId, targetUserId }) => {
    const room = rooms[roomId];
    if (!room) return;

    const currentHost = room.participants.find(p => p.id === socket.id);
    if (!currentHost || currentHost.role !== 'Host') return;

    const newHost = room.participants.find(p => p.id === targetUserId);
    if (newHost) {
      currentHost.role = 'Participant';
      newHost.role = 'Host';

      io.to(roomId).emit('role_assigned', { participants: room.participants });
      io.to(socket.id).emit('role_updated_self', { newRole: 'Participant' });
      io.to(targetUserId).emit('role_updated_self', { newRole: 'Host' });
    }
  });

  // Handle Disconnection
  socket.on('disconnect', () => {
    // Scan memory store for any active rooms containing this socket id
    Object.keys(rooms).forEach((roomId) => {
      const room = rooms[roomId];
      const disappearingUser = room.participants.find(p => p.id === socket.id);
      
      if (disappearingUser) {
        // Remove the user from the list
        room.participants = room.participants.filter(p => p.id !== socket.id);
        const activeHostExists = room.participants.some(p => p.role === 'Host');

        if (disappearingUser.role === 'Host' && !activeHostExists) {
          console.log(`True room Host vanished. Killing room session in memory: ${roomId}`);
          io.to(roomId).emit('host_disconnected');
          if (room.mediaPath) safeUnlink(room.mediaPath);
          delete rooms[roomId]; // Wipe room data
        } else {
          io.to(roomId).emit('user_left', { participants: room.participants });
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`WatchParty Memory Engine running perfectly on port ${PORT}`);
});
