import React, { useState, useEffect } from 'react';
import WatchRoom from './WatchRoom';
import profileImg from './profile.jpg'; // Make sure your photo is saved as profile.jpg in your src/ folder

export default function App() {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');

  // Lock global HTML/Body background colors to prevent white base canvas flashes
  useEffect(() => {
    const originalBodyBg = document.body.style.backgroundColor;
    const originalHtmlBg = document.documentElement.style.backgroundColor;

    document.body.style.backgroundColor = '#060214';
    document.documentElement.style.backgroundColor = '#060214';

    return () => {
      document.body.style.backgroundColor = originalBodyBg;
      document.documentElement.style.backgroundColor = originalHtmlBg;
    };
  }, []);

  const handleCreateRoom = () => {
    if (!username.trim()) return alert('Please choose an alias display handle.');
    const generatedId = Math.random().toString(36).substring(2, 9).toUpperCase();
    setRoomId(generatedId);
    setJoined(true);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!username.trim() || !roomId.trim()) return alert('Please complete all form layout properties.');
    setJoined(true);
  };

  const styles = {
    viewWrapper: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      width: '100vw',
      background: 'linear-gradient(135deg, #0f0c20 0%, #15102a 50%, #060214 100%)',
      padding: '40px 20px',
      boxSizing: 'border-box',
      fontFamily: '"Segoe UI", Roboto, sans-serif',
      position: 'relative' // Anchor absolute elements like the corner footer
    },
    outsideHeroBlock: {
      textAlign: 'center',
      marginBottom: '32px',
      zIndex: 2
    },
    outsideSubHeader: {
      fontSize: '15px',
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: '4px',
      color: '#ff007f',
      margin: '0 0 8px 0',
      textShadow: '0 0 15px rgba(255, 0, 127, 0.4)'
    },
    outsideMainHeader: {
      fontSize: '42px',
      fontWeight: '900',
      margin: '0',
      letterSpacing: '-1px',
      background: 'linear-gradient(90deg, #00f0ff 0%, #ff007f 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))'
    },
    centralCard: {
      width: '100%',
      maxWidth: '400px',
      background: 'rgba(255, 255, 255, 0.03)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '24px',
      padding: '35px',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
      color: '#fff',
      boxSizing: 'border-box',
      zIndex: 2
    },
    labelText: {
      display: 'block',
      removeAttribute: 'true',
      marginBottom: '8px',
      fontSize: '13px',
      fontWeight: '600',
      color: '#b3b3b3',
      textTransform: 'uppercase',
      letterSpacing: '1px'
    },
    inputElement: {
      width: '100%',
      background: 'rgba(0, 0, 0, 0.3)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      padding: '12px 16px',
      borderRadius: '10px',
      color: '#fff',
      fontSize: '15px',
      outline: 'none',
      boxSizing: 'border-box',
      marginBottom: '20px'
    },
    neonBtn: {
      width: '100%',
      background: 'linear-gradient(90deg, #ff007f 0%, #7928ca 100%)',
      color: '#fff',
      border: 'none',
      padding: '14px',
      borderRadius: '10px',
      fontWeight: '600',
      fontSize: '15px',
      cursor: 'pointer',
      boxShadow: '0 4px 20px rgba(255, 0, 127, 0.3)'
    },
    dividerSec: {
      display: 'flex',
      alignItems: 'center',
      textAlign: 'center',
      margin: '25px 0',
      color: '#555',
      fontSize: '12px',
      fontWeight: '600'
    },
    line: {
      flexGrow: 1,
      height: '1px',
      background: 'rgba(255,255,255,0.08)'
    },
    secondaryBtn: {
      width: '100%',
      background: '#fff',
      color: '#0f0c20',
      border: 'none',
      padding: '14px',
      borderRadius: '10px',
      fontWeight: '600',
      fontSize: '15px',
      cursor: 'pointer'
    },
    devRightCornerFooter: {
      position: 'absolute',
      bottom: '24px',
      right: '24px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      background: 'rgba(255, 255, 255, 0.02)',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      borderRadius: '14px',
      padding: '10px 16px',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
      zIndex: 1
    },
    avatarImg: {
      width: '42px',
      height: '42px',
      borderRadius: '50%',
      objectFit: 'cover',
      border: '2px solid #00f0ff',
      boxShadow: '0 0 8px rgba(0, 240, 255, 0.2)',
      order: 2 
    },
    devTextContainer: {
      display: 'flex',
      flexDirection: 'column',
      textAlign: 'right', 
      order: 1
    },
    devLabel: {
      fontSize: '10px',
      color: '#ff007f',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: '0.8px'
    },
    devName: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#ffffff'
    }
  };

  if (joined) {
    return <WatchRoom roomId={roomId} username={username} onLeave={() => setJoined(false)} />;
  }

  return (
    <div style={styles.viewWrapper}>
      <style>{`
        html, body, #root {
          margin: 0;
          padding: 0;
          background-color: #060214 !important;
          overflow-x: hidden;
        }
        /* Responsive adjustments to keep bottom element cleaner on mobile screens */
        @media (max-width: 600px) {
          .dev-footer-badge {
            position: relative !important;
            bottom: auto !important;
            right: auto !important;
            margin-top: 40px;
          }
        }
      `}</style>

      {/* Prominent Outside Typography Header Block */}
      <div style={styles.outsideHeroBlock}>
        <div style={styles.outsideSubHeader}>⚡ Tune In Together</div>
        <h1 style={styles.outsideMainHeader}>Welcome to WatchParty</h1>
      </div>

      <div style={styles.centralCard}>
        <div>
          <label style={styles.labelText}>Enter Name</label>
          <input 
            type="text" 
            placeholder="Enter Name..." 
            value={username} 
            onChange={(e) => setUsername(e.target.value)}
            style={styles.inputElement}
          />
        </div>

        <button onClick={handleCreateRoom} style={styles.neonBtn}>
          ✨ Create New Party Room
        </button>

        <div style={styles.dividerSec}>
          <div style={styles.line}></div>
          <span style={{ padding: '0 10px' }}>OR JOIN EXISTING</span>
          <div style={styles.line}></div>
        </div>

        <form onSubmit={handleJoinRoom}>
          <div>
            <label style={styles.labelText}>Room Code</label>
            <input 
              type="text" 
              placeholder="PASTE CODE" 
              value={roomId} 
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              style={{ ...styles.inputElement, textAlign: 'center', fontWeight: '700', color: '#00f0ff' }}
            />
          </div>
          <button type="submit" style={styles.secondaryBtn}>
            Join Party Code
          </button>
        </form>
      </div>

      {/* Developer Profile Section - Aligned Bottom Right */}
      <div style={styles.devRightCornerFooter} className="dev-footer-badge">
        <div style={styles.devTextContainer}>
          <span style={styles.devLabel}>Developed By</span>
          <span style={styles.devName}>Rishu Srivastav</span>
        </div>
        <img 
          src={profileImg} 
          alt="Rishu Srivastav" 
          style={styles.avatarImg} 
          onError={(e) => {
            e.target.style.borderColor = 'rgba(255,255,255,0.1)';
          }}
        />
      </div>
    </div>
  );
}