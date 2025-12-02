import React, { useEffect, useRef, useState } from 'react';
import './CallWindow.css';

const API_URL = 'http://localhost:5000/api';

function CallWindow({ 
  call, 
  currentUser, 
  onAccept, 
  onReject, 
  onEnd,
  onToggleMute,
  callStatus,
  isCallActive,
  callDuration,
  connectionState,
  isMuted,
  localVideoRef,
  remoteVideoRef
}) {
  const { caller, receiver } = call || {};
  const otherUser = caller?._id === currentUser?._id ? receiver : caller;
  const ringtoneRef = useRef(null);
  const [isRinging, setIsRinging] = useState(false);

  useEffect(() => {
    // Play ringtone when incoming call
    if (callStatus === 'ringing' && caller?._id !== currentUser?._id) {
      setIsRinging(true);
      // Create and play ringtone
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.5);
      
      const ringInterval = setInterval(() => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        osc.start();
        osc.stop(audioContext.currentTime + 0.5);
      }, 2000);

      ringtoneRef.current = ringInterval;
    } else {
      setIsRinging(false);
      if (ringtoneRef.current) {
        clearInterval(ringtoneRef.current);
        ringtoneRef.current = null;
      }
    }

    return () => {
      if (ringtoneRef.current) {
        clearInterval(ringtoneRef.current);
      }
    };
  }, [callStatus, caller, currentUser]);

  const getStatusText = () => {
    switch (callStatus) {
      case 'calling':
        return 'Звонок...';
      case 'ringing':
        if (caller?._id === currentUser?._id) {
          return 'Звоним...';
        }
        return 'Входящий звонок';
      case 'active':
        return 'Идет разговор';
      default:
        return '';
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Debug: log current state
  useEffect(() => {
    console.log('CallWindow state:', {
      callStatus,
      isCallActive,
      isMuted,
      hasToggleMute: !!onToggleMute
    });
  }, [callStatus, isCallActive, isMuted, onToggleMute]);

  return (
    <div className="call-window">
      <div className="call-content">
        <div className="call-header">
          <div className="call-user-info">
            <div className="call-avatar-wrapper">
              {otherUser?.avatar ? (
                <img 
                  src={otherUser.avatar.startsWith('http') ? otherUser.avatar : `${API_URL}/uploads/${otherUser.avatar}`} 
                  alt={otherUser.username} 
                  className="call-avatar"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    if (e.target.nextSibling) {
                      e.target.nextSibling.style.display = 'flex';
                    }
                  }}
                />
              ) : null}
              {(!otherUser?.avatar || otherUser?.avatar === '') && (
                <div className="call-avatar-placeholder">
                  {otherUser?.username?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
              {isRinging && <div className="call-ripple"></div>}
              {callStatus === 'active' && <div className="call-active-indicator"></div>}
            </div>
            <div className="call-user-details">
              <div className="call-username">{otherUser?.username || 'Пользователь'}</div>
              <div className="call-status-text">
                {callStatus === 'active' && callDuration > 0 ? (
                  <span className="call-duration">{formatDuration(callDuration)}</span>
                ) : (
                  getStatusText()
                )}
              </div>
              {connectionState && connectionState !== 'connected' && callStatus === 'active' && (
                <div className="call-connection-status">
                  {connectionState === 'connecting' && 'Подключение...'}
                  {connectionState === 'disconnected' && 'Соединение потеряно'}
                  {connectionState === 'failed' && 'Ошибка соединения'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Audio elements (hidden, used for audio streams) */}
        <audio 
          ref={localVideoRef} 
          autoPlay 
          muted 
          playsInline
          style={{ display: 'none' }}
          onLoadedMetadata={() => {
            console.log('Local audio metadata loaded');
            if (localVideoRef.current) {
              localVideoRef.current.play().catch(e => console.error('Local audio play error:', e));
            }
          }}
        />
        <audio 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline
          muted={false}
          volume={1.0}
          style={{ display: 'none' }}
          onLoadedMetadata={() => {
            console.log('Remote audio metadata loaded');
            if (remoteVideoRef.current) {
              remoteVideoRef.current.muted = false;
              remoteVideoRef.current.volume = 1.0;
              remoteVideoRef.current.play().catch(e => {
                console.error('Remote audio play error:', e);
                // Retry
                setTimeout(() => {
                  if (remoteVideoRef.current) {
                    remoteVideoRef.current.play().catch(err => console.error('Retry play error:', err));
                  }
                }, 500);
              });
            }
          }}
          onCanPlay={() => {
            console.log('Remote audio can play');
            if (remoteVideoRef.current) {
              remoteVideoRef.current.muted = false;
              remoteVideoRef.current.volume = 1.0;
              remoteVideoRef.current.play().catch(e => {
                console.error('Remote audio play error:', e);
              });
            }
          }}
          onPlay={() => {
            console.log('✅ Remote audio started playing');
          }}
          onPause={() => {
            console.log('⚠️ Remote audio paused');
          }}
        />

        <div className="call-controls">
          {/* Входящий звонок от другого пользователя - показать кнопки принять/отклонить */}
          {callStatus === 'ringing' && caller?._id !== currentUser?._id ? (
            <>
              <button 
                className="call-btn call-btn-accept"
                onClick={onAccept}
                title="Принять звонок"
              >
                <span className="call-btn-icon">📞</span>
              </button>
              <button 
                className="call-btn call-btn-reject"
                onClick={onReject}
                title="Отклонить"
              >
                <span className="call-btn-icon">✕</span>
              </button>
            </>
          ) : (
            /* Все остальные состояния - показать кнопки мьюта и завершения */
            <>
              {/* Кнопка мьюта - всегда показываем */}
              <button 
                className={`call-btn call-btn-mute ${isMuted ? 'muted' : ''}`}
                onClick={onToggleMute || (() => console.warn('Mute function not available'))}
                title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
                disabled={!onToggleMute}
              >
                <span className="call-btn-icon">
                  {isMuted ? '🔇' : '🎤'}
                </span>
              </button>
              {/* Кнопка завершения звонка */}
              <button 
                className="call-btn call-btn-end"
                onClick={onEnd}
                title="Завершить звонок"
              >
                <span className="call-btn-icon">📞</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default CallWindow;

