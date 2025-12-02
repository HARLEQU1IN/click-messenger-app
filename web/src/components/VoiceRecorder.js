import React, { useState, useRef, useEffect } from 'react';
import './VoiceRecorder.css';

function VoiceRecorder({ onSend, onCancel }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      // Cleanup
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        // Останавливаем все треки потока
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Запускаем таймер
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Не удалось получить доступ к микрофону. Проверьте разрешения браузера.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const handleSend = async () => {
    if (audioBlob) {
      // Получаем длительность аудио перед отправкой
      const audio = new Audio(audioUrl);
      let duration = recordingTime;
      
      try {
        await new Promise((resolve, reject) => {
          audio.addEventListener('loadedmetadata', () => {
            duration = audio.duration || recordingTime;
            resolve();
          });
          audio.addEventListener('error', reject);
          audio.load();
        });
      } catch (error) {
        console.error('Error loading audio metadata:', error);
        duration = recordingTime;
      }

      onSend(audioBlob, duration);
      // Cleanup
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      setAudioBlob(null);
      setAudioUrl(null);
      setRecordingTime(0);
    }
  };

  const handleCancel = () => {
    stopRecording();
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    onCancel();
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="voice-recorder">
      {!isRecording && !audioBlob && (
        <div className="voice-recorder-controls">
          <button 
            className="voice-record-btn"
            onClick={startRecording}
            title="Начать запись"
          >
            🎤
          </button>
          <span className="voice-record-hint">Нажмите для начала записи</span>
        </div>
      )}

      {isRecording && (
        <div className="voice-recording">
          <div className="voice-recording-indicator">
            <div className="pulse-dot"></div>
            <span className="recording-text">Запись...</span>
            <span className="recording-time">{formatTime(recordingTime)}</span>
          </div>
          <button 
            className="voice-stop-btn"
            onClick={stopRecording}
            title="Остановить запись"
          >
            ⏹
          </button>
        </div>
      )}

      {audioBlob && !isRecording && (
        <div className="voice-preview">
          <audio src={audioUrl} controls className="voice-audio-preview" />
          <div className="voice-preview-actions">
            <button 
              className="voice-send-btn"
              onClick={handleSend}
              title="Отправить"
            >
              ✓ Отправить
            </button>
            <button 
              className="voice-cancel-btn"
              onClick={handleCancel}
              title="Отменить"
            >
              ✕ Отменить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default VoiceRecorder;

