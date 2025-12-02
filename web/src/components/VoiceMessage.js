import React, { useState, useRef, useEffect } from 'react';
import './VoiceMessage.css';

function VoiceMessage({ audioUrl, duration, fileSize, isOwn }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const audioRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      setCurrentTime(audio.currentTime);
      if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(updateTime);
      }
    };

    const handleLoadedMetadata = () => {
      setTotalDuration(audio.duration || duration || 0);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);

    if (isPlaying) {
      audio.play();
      animationFrameRef.current = requestAnimationFrame(updateTime);
    } else {
      audio.pause();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, duration]);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  // Генерируем простую визуализацию волны (в реальности нужны данные waveform с сервера)
  const generateWaveform = () => {
    const bars = 70;
    const barsArray = [];
    
    // Используем синусоиду для более реалистичного вида
    for (let i = 0; i < bars; i++) {
      const position = i / bars;
      const isActive = position * 100 < progress;
      
      // Создаем волнообразный паттерн с меньшей амплитудой
      const wave = Math.sin(position * Math.PI * 4) * 0.5 + 0.5;
      const height = (wave * 35 + 25) + (Math.random() * 8 - 4); // 25-60% с небольшими вариациями
      
      barsArray.push(
        <div
          key={i}
          className={`waveform-bar ${isActive ? 'active' : ''}`}
          style={{ 
            height: `${Math.max(20, Math.min(75, height))}%`,
            transition: isActive ? 'opacity 0.1s' : 'opacity 0.3s'
          }}
        />
      );
    }
    return barsArray;
  };

  return (
    <div className={`voice-message ${isOwn ? 'own' : 'other'}`}>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      
      <button
        className={`voice-play-button ${isPlaying ? 'playing' : ''}`}
        onClick={togglePlay}
        aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
      >
        {isPlaying ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="2" y="2" width="3" height="8" fill="currentColor" />
            <rect x="7" y="2" width="3" height="8" fill="currentColor" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2L10 6L2 10V2Z" fill="currentColor" />
          </svg>
        )}
      </button>

      <div className="voice-content">
        <div className="voice-waveform">
          {generateWaveform()}
        </div>
        <div className="voice-info">
          <span className="voice-duration">{formatTime(currentTime || totalDuration)}</span>
          {fileSize && <span className="voice-size">{formatFileSize(fileSize)}</span>}
        </div>
      </div>

      <div className="voice-progress" style={{ width: `${progress}%` }} />
    </div>
  );
}

export default VoiceMessage;

