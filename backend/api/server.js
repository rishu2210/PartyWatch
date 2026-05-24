const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

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