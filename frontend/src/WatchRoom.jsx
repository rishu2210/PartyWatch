import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const BACKEND_URL = 'https://partywatch-q5d7.onrender.com';

export default function WatchRoom({ roomId, username, onLeave }) {
  const [socket, setSocket] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [myRole, setMyRole] = useState('Participant');
  const [myId, setMyId] = useState('');
  
  const [videoId, setVideoId] = useState('');
  const [urlInput, setUrlInput] = useState('');
  
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);

  const hostTimeRef = useRef(0);
  const hostIsPlayingRef = useRef(false);

  const isSyncing = useRef(false);
  const playerRef = useRef(null);

  const roleRef = useRef('Participant');
  
  useEffect(() => {
    roleRef.current = myRole;
  }, [myRole]);

  const isHost = myRole === 'Host';
  const isModerator = myRole === 'Moderator';
  const isPrivileged = isHost || isModerator;

  // Global Page Body Background Enforcement
  useEffect(() => {
    const originalBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#0a051b'; // Match page wrapper background
    return () => {
      document.body.style.backgroundColor = originalBg;
    };
  }, []);

  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    const newSocket = io(BACKEND_URL, {
      transports: ['websocket'],
      upgrade: false
    });
    setSocket(newSocket);

    newSocket.emit('join_room', { roomId, username });

    newSocket.on('sync_state', ({ videoId, isPlaying, currentTime, myRole, myId }) => {
      setVideoId(videoId);
      setMyRole(myRole);
      setMyId(myId);

      hostTimeRef.current = currentTime;
      hostIsPlayingRef.current = isPlaying;

      setTimeout(() => {
        if (playerRef.current && typeof playerRef.current.seekTo === 'function' && currentTime > 0) {
          isSyncing.current = true;
          playerRef.current.seekTo(currentTime, true);
          if (!isPlaying) {
            playerRef.current.pauseVideo();
          }
        }
      }, 1000);
    });

    newSocket.on('user_joined', ({ participants }) => setParticipants(participants));
    newSocket.on('user_left', ({ participants }) => setParticipants(participants));
    newSocket.on('role_assigned', ({ participants }) => setParticipants(participants));
    newSocket.on('participant_removed', ({ participants }) => setParticipants(participants));
    
    newSocket.on('role_updated_self', ({ newRole }) => {
      setMyRole(newRole);
    });

    newSocket.on('host_disconnected', () => {
      alert('The session was closed or host disconnected.');
      onLeave();
    });

    newSocket.on('host_heartbeat_stream', ({ time, isPlaying }) => {
      hostTimeRef.current = time;
      hostIsPlayingRef.current = isPlaying;
    });

    newSocket.on('play', () => {
      const privileged = roleRef.current === 'Host' || roleRef.current === 'Moderator';
      if (privileged) return; 
      if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
        isSyncing.current = true;
        playerRef.current.playVideo();
      }
    });

    newSocket.on('pause', () => {
      const privileged = roleRef.current === 'Host' || roleRef.current === 'Moderator';
      if (privileged) return;
      if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
        isSyncing.current = true;
        playerRef.current.pauseVideo();
      }
    });

    newSocket.on('seek', ({ time }) => {
      hostTimeRef.current = time;
      const privileged = roleRef.current === 'Host' || roleRef.current === 'Moderator';
      if (privileged) return;
      if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
        isSyncing.current = true;
        playerRef.current.seekTo(time, true);
      }
    });

    newSocket.on('force_seek', ({ time }) => {
      hostTimeRef.current = time;
      if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
        isSyncing.current = true;
        playerRef.current.seekTo(time, true);
      }
    });

    newSocket.on('change_video', ({ videoId }) => {
      setVideoId(videoId);
    });

    newSocket.on('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    newSocket.on('kicked', () => {
      alert('You have been removed from this room.');
      onLeave();
    });

    return () => {
      newSocket.disconnect();
      playerRef.current = null;
    };
  }, [roomId, username, onLeave]);

  // Player creation listener
  useEffect(() => {
    if (!videoId) return;

    const initPlayer = () => {
      const targetContainer = document.getElementById('watchparty-player-frame');
      if (targetContainer) {
        targetContainer.innerHTML = '<div id="yt-player-placeholder" style="background-color: #000;"></div>';
      }

      playerRef.current = new window.YT.Player('yt-player-placeholder', {
        videoId: videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          controls: 1, 
          fs: 0,      
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          'onStateChange': (e) => {
            if (!socket) return;

            if (isSyncing.current) {
              isSyncing.current = false;
              return;
            }

            const privileged = roleRef.current === 'Host' || roleRef.current === 'Moderator';
            if (!privileged) return;

            const currentTime = playerRef.current ? playerRef.current.getCurrentTime() : 0;
            if (e.data === window.YT.PlayerState.PLAYING) {
              socket.emit('play', { roomId, time: currentTime });
            }
            if (e.data === window.YT.PlayerState.PAUSED) {
              socket.emit('pause', { roomId, time: currentTime });
            }
          }
        }
      });
    };

    if (window.YT && window.YT.Player) {
      if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
        isSyncing.current = true;
        playerRef.current.loadVideoById(videoId);
      } else {
        initPlayer();
      }
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (window.onYouTubeIframeAPIReady === initPlayer) {
        window.onYouTubeIframeAPIReady = null;
      }
    };
  }, [videoId, socket, roomId]);

  // Global Sync intervals setup
  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (roleRef.current === 'Host' && playerRef.current && typeof playerRef.current.getCurrentTime === 'function' && socket) {
        const currentTime = playerRef.current.getCurrentTime();
        const isPlaying = playerRef.current.getPlayerState() === window.YT.PlayerState.PLAYING;
        socket.emit('time_heartbeat', { roomId, time: currentTime, isPlaying });
      }
    }, 2000);

    return () => clearInterval(heartbeat);
  }, [socket, roomId]);

  const handleSyncWithHost = () => {
    if (!playerRef.current || typeof playerRef.current.seekTo !== 'function') return;
    isSyncing.current = true;
    playerRef.current.seekTo(hostTimeRef.current, true);
    if (hostIsPlayingRef.current) {
      playerRef.current.playVideo();
    } else {
      playerRef.current.pauseVideo();
    }
  };

  const handleManualSeek = () => {
    if (!isPrivileged || !playerRef.current || typeof playerRef.current.getCurrentTime !== 'function' || !socket) return;
    socket.emit('force_seek', { roomId, time: playerRef.current.getCurrentTime() });
  };

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = urlInput.match(regExp);
    const id = (match && match[2].length === 11) ? match[2] : urlInput;
    if (id && socket) {
      socket.emit('change_video', { roomId, videoId: id });
      setUrlInput('');
    }
  };

  const sendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    socket.emit('send_message', { roomId, text: chatInput });
    setChatInput('');
  };

  const handleAssignRole = (targetUserId, currentRole) => {
    if (!isHost || !socket) return;
    const nextRole = currentRole === 'Participant' ? 'Moderator' : 'Participant';
    socket.emit('assign_role', { roomId, targetUserId, newRole: nextRole });
  };

  const handleRemoveParticipant = (targetUserId) => {
    if (!isHost || !socket) return;
    socket.emit('remove_participant', { roomId, targetUserId });
  };

  const handleTransferHost = (targetUserId) => {
    if (!isHost || !socket) return;
    const confirmTransfer = window.confirm("Transfer room ownership? You will drop down to a generic viewer.");
    if (confirmTransfer) {
      socket.emit('transfer_host', { roomId, targetUserId });
    }
  };

  const styles = {
    pageWrapper: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#0a051b', backgroundImage: 'radial-gradient(circle at top right, #1a0b36 0%, #0a051b 70%)', fontFamily: '"Segoe UI", Roboto, sans-serif', color: '#fff', padding: '20px', boxSizing: 'border-box' },
    dashboardLayout: { display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: '24px', width: '100%', maxWidth: '1280px', height: '85vh', minHeight: '600px', background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '20px', padding: '24px', boxSizing: 'border-box', boxShadow: '0 30px 60px rgba(0,0,0,0.6)' },
    videoColumn: { display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', width: '100%' },
    panelColumn: { display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '24px' },
    glassCard: { background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '10px', padding: '14px' },
    inputField: { background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#fff', padding: '10px 14px', borderRadius: '8px', outline: 'none', fontSize: '14px', width: '100%', boxSizing: 'border-box' },
    neonBtn: { background: 'linear-gradient(90deg, #ff007f 0%, #7928ca 100%)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 15px rgba(255,0,127,0.3)', whiteSpace: 'nowrap' },
    syncBtn: { background: 'linear-gradient(90deg, #00f0ff 0%, #0072ff 100%)', color: '#000', border: 'none', padding: '12px 18px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,240,255,0.4)', width: '100%', fontSize: '14px', letterSpacing: '0.5px' },
    actionBtn: { fontSize: '11px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px' }
  };

  return (
    <div style={styles.pageWrapper}>
      {/* Dynamic CSS Override Block to target embedded iframe background properties explicitly */}
      <style>{`
        #watchparty-player-frame iframe {
          background-color: #000000 !important;
        }
      `}</style>
      
      <div style={styles.dashboardLayout}>
        
        <div style={styles.videoColumn}>
          <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000000', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div id="watchparty-player-frame" style={{ width: '100%', height: '100%', backgroundColor: '#000000' }}>
              <div id="yt-player-placeholder" style={{ backgroundColor: '#000000' }}></div>
            </div>
          </div>
        </div>

        <div style={styles.panelColumn}>
          <div>
            <h2 style={{ margin: '0 0 5px 0', fontSize: '24px', color: '#ff007f', textShadow: '0 0 10px rgba(255,0,127,0.3)' }}>WatchParty</h2>
            <p style={{ margin: 0, color: '#aaa', fontSize: '13px' }}>Room Code: <strong style={{ color: '#00f0ff' }}>{roomId}</strong> ({myRole})</p>
          </div>

          {isPrivileged ? (
            <form onSubmit={handleUrlSubmit} style={{ display: 'flex', gap: '8px' }}>
              <input type="text" placeholder="Paste YouTube Video URL or ID" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} style={styles.inputField} />
              <button type="submit" style={styles.neonBtn}>Change Video</button>
            </form>
          ) : (
            <button onClick={handleSyncWithHost} style={styles.syncBtn}>⚡ Sync with Host's Time</button>
          )}

          <div style={{ ...styles.glassCard, maxHeight: '180px', overflowY: 'auto' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#00f0ff', fontSize: '13px' }}>Room Directory ({participants.length})</h4>
            {participants.map((p) => (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{p.username} <small style={{ color: p.role === 'Host' ? '#ff007f' : '#00f0ff' }}>({p.role})</small></span>
                  
                  {isHost && p.id !== myId && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => handleAssignRole(p.id, p.role)} style={{ ...styles.actionBtn, borderColor: '#00f0ff', color: '#00f0ff' }}>
                        {p.role === 'Moderator' ? 'Demote' : 'Mod'}
                      </button>
                      <button onClick={() => handleTransferHost(p.id)} style={{ ...styles.actionBtn, borderColor: '#ffaa00', color: '#ffaa00' }}>
                        👑 Pass Host
                      </button>
                      <button onClick={() => handleRemoveParticipant(p.id)} style={{ ...styles.actionBtn, borderColor: '#ff4a4a', color: '#ff4a4a' }}>✕ Kick</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: '150px', justifyContent: 'space-between' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#00f0ff', fontSize: '13px' }}>Live Feedback Chat</h4>
            <div style={{ flexGrow: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '10px', marginBottom: '8px', maxHeight: '180px' }}>
              {messages.map((m, idx) => (
                <div key={m.id || idx} style={{ fontSize: '13px', marginBottom: '6px' }}>
                  <strong style={{ color: '#ff007f' }}>{m.sender}:</strong> <span style={{ color: '#ddd' }}>{m.text}</span>
                </div>
              ))}
            </div>
            <form onSubmit={sendChatMessage} style={{ display: 'flex', gap: '6px' }}>
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Send a comment..." style={styles.inputField} />
              <button type="submit" style={{ ...styles.neonBtn, padding: '8px 14px' }}>Send</button>
            </form>
          </div>

          {isPrivileged && (
            <button onClick={handleManualSeek} style={{ background: 'none', border: '1px solid #00f0ff', color: '#00f0ff', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
              🔄 Force Re-sync Viewers To My Time
            </button>
          )}

          <button onClick={onLeave} style={{ background: 'rgba(255,74,74,0.1)', border: '1px solid rgba(255,74,74,0.2)', color: '#ff4a4a', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            Leave Watch Session
          </button>

        </div>
      </div>
    </div>
  );
}