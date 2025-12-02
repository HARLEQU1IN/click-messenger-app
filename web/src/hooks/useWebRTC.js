import { useState, useEffect, useRef } from 'react';

const useWebRTC = (socket, localUserId, defaultRemoteUserId) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState('idle'); // idle, calling, ringing, active, ended
  const [callDuration, setCallDuration] = useState(0);
  const [connectionState, setConnectionState] = useState('new'); // new, connecting, connected, disconnected, failed
  const [isMuted, setIsMuted] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  // Enhanced ICE configuration with TURN servers (like Yandex Telemost)
  const configuration = {
    iceServers: [
      // STUN servers for NAT discovery
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // TURN servers for relay (better NAT traversal)
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    iceCandidatePoolSize: 10, // Pre-gather candidates for faster connection
    iceTransportPolicy: 'all' // Use both relay and direct connections
  };

  // Initialize local stream
  const initializeLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false // Only audio for voice calls
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log('Local stream set on audio element');
      }
      console.log('Local stream initialized with tracks:', stream.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState
      })));
      return stream;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  };

  // Create peer connection
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection(configuration);

    // Add local stream tracks
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      console.log('Adding local tracks to peer connection:', tracks.length);
      tracks.forEach(track => {
        console.log('Adding track:', { kind: track.kind, enabled: track.enabled });
        pc.addTrack(track, localStreamRef.current);
      });
    } else {
      console.warn('No local stream available when creating peer connection');
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('=== Remote track received ===');
      console.log('Event:', event);
      console.log('Streams:', event.streams);
      console.log('Track:', event.track);
      console.log('Track kind:', event.track?.kind);
      console.log('Track enabled:', event.track?.enabled);
      
      // Get the stream from event
      let stream = null;
      if (event.streams && event.streams.length > 0) {
        stream = event.streams[0];
      } else if (event.track) {
        // Create a new stream from the track if no stream is provided
        stream = new MediaStream([event.track]);
      }
      
      if (stream) {
        console.log('Setting remote stream:', stream);
        console.log('Remote stream tracks:', stream.getTracks().map(t => ({
          kind: t.kind,
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState
        })));
        
        setRemoteStream(stream);
        
        // Update audio element
        if (remoteVideoRef.current) {
          console.log('Setting srcObject on remote audio element');
          remoteVideoRef.current.srcObject = stream;
          
          // Ensure audio is not muted
          remoteVideoRef.current.muted = false;
          remoteVideoRef.current.volume = 1.0;
          
          // Explicitly play the audio with retry
          const playAudio = () => {
            remoteVideoRef.current.play()
              .then(() => {
                console.log('✅ Remote audio playing successfully');
                console.log('Audio element state:', {
                  paused: remoteVideoRef.current.paused,
                  muted: remoteVideoRef.current.muted,
                  volume: remoteVideoRef.current.volume,
                  readyState: remoteVideoRef.current.readyState
                });
              })
              .catch(error => {
                console.error('❌ Error playing remote audio:', error);
                // Retry after a short delay
                setTimeout(() => {
                  if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
                    console.log('Retrying to play remote audio...');
                    playAudio();
                  }
                }, 500);
              });
          };
          
          // Wait for metadata to load before playing
          remoteVideoRef.current.onloadedmetadata = () => {
            console.log('Remote audio metadata loaded, attempting to play...');
            playAudio();
          };
          
          // Also try to play immediately
          playAudio();
        } else {
          console.warn('remoteVideoRef.current is null');
        }
      } else {
        console.error('No stream or track in event');
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && socket.connected) {
        socket.emit('ice-candidate', {
          to: defaultRemoteUserId,
          candidate: event.candidate
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('Connection state:', state);
      setConnectionState(state);
      
      if (state === 'connected') {
        setIsCallActive(true);
        setCallStatus('active');
      } else if (state === 'disconnected' || state === 'failed') {
        if (callStatus === 'active') {
          // Try to reconnect or end call
          setTimeout(() => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
              endCall();
            }
          }, 3000);
        } else {
          endCall();
        }
      }
    };

    // Handle ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        // Try to restart ICE
        try {
          pc.restartIce();
        } catch (e) {
          console.error('Error restarting ICE:', e);
        }
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  // Start call (initiator)
  const startCall = async (remoteUserIdParam = null) => {
    try {
      // Use parameter if provided, otherwise use default from hook
      const targetRemoteUserId = remoteUserIdParam || defaultRemoteUserId;
      
      console.log('=== Starting WebRTC Call ===');
      console.log('Local user ID:', localUserId);
      console.log('Remote user ID (param):', remoteUserIdParam);
      console.log('Remote user ID (default):', defaultRemoteUserId);
      console.log('Remote user ID (final):', targetRemoteUserId);
      console.log('Socket available:', !!socket);
      console.log('Socket connected:', socket?.connected);
      
      if (!socket || !socket.connected) {
        throw new Error('Socket not connected');
      }

      if (!localUserId || !targetRemoteUserId) {
        console.error('Missing IDs:', { localUserId, targetRemoteUserId });
        throw new Error('User IDs are missing');
      }

      setCallStatus('calling');
      console.log('Initializing local stream...');
      await initializeLocalStream();
      console.log('Creating peer connection...');
      const pc = createPeerConnection();

      console.log('Creating offer...');
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      await pc.setLocalDescription(offer);
      console.log('Offer created and set as local description');

      if (!socket || !socket.connected) {
        throw new Error('Socket not connected');
      }

      if (!localUserId || !targetRemoteUserId) {
        throw new Error('User IDs are missing');
      }

      const callData = {
        from: String(localUserId),
        to: String(targetRemoteUserId),
        offer: offer,
        chatId: null
      };

      console.log('=== Emitting call-user event ===');
      console.log('Call data:', callData);
      console.log('Socket connected:', socket.connected);
      console.log('Socket ID:', socket.id);

      socket.emit('call-user', callData, (response) => {
        console.log('Call-user response:', response);
        if (response && response.error) {
          console.error('Call failed:', response.error);
          setCallStatus('idle');
          throw new Error(response.error);
        }
      });
      
      console.log(`Call initiated: from ${localUserId} to ${targetRemoteUserId}`);
      
      // Log connection state after a delay
      setTimeout(() => {
        if (peerConnectionRef.current) {
          console.log('Connection state after start:', peerConnectionRef.current.connectionState);
          console.log('ICE connection state:', peerConnectionRef.current.iceConnectionState);
          console.log('ICE gathering state:', peerConnectionRef.current.iceGatheringState);
        }
      }, 1000);

      setCallStatus('ringing');
    } catch (error) {
      console.error('Error starting call:', error);
      setCallStatus('idle');
      throw error;
    }
  };

  // Accept call (receiver)
  const acceptCall = async (offer) => {
    try {
      console.log('=== Accepting call ===');
      console.log('Offer:', offer);
      
      setCallStatus('active');
      console.log('Initializing local stream for receiver...');
      await initializeLocalStream();
      console.log('Creating peer connection for receiver...');
      const pc = createPeerConnection();

      console.log('Setting remote description...');
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('Remote description set, waiting for tracks...');
      
      console.log('Creating answer...');
      const answer = await pc.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      console.log('Setting local description...');
      await pc.setLocalDescription(answer);
      console.log('Answer created and set');

      socket.emit('accept-call', {
        to: defaultRemoteUserId,
        answer: answer
      });

      setIsCallActive(true);
      setCallStatus('active');
      console.log('Call accepted successfully');
      
      // Log connection state
      setTimeout(() => {
        console.log('Connection state after accept:', pc.connectionState);
        console.log('ICE connection state:', pc.iceConnectionState);
        console.log('ICE gathering state:', pc.iceGatheringState);
      }, 1000);
    } catch (error) {
      console.error('Error accepting call:', error);
      setCallStatus('idle');
      throw error;
    }
  };

  // Reject call
  const rejectCall = () => {
    if (socket && socket.connected && defaultRemoteUserId) {
      socket.emit('reject-call', { to: defaultRemoteUserId });
    }
    setCallStatus('idle');
  };

  // End call
  const endCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setIsCallActive(false);
    setCallStatus('idle');

    if (socket && socket.connected && defaultRemoteUserId) {
      socket.emit('end-call', { to: defaultRemoteUserId });
    }
  };

  // Setup socket listeners
  useEffect(() => {
    if (!socket) return;

    const handleCallAccepted = async (data) => {
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(data.answer)
          );
          setIsCallActive(true);
          setCallStatus('active');
        }
      } catch (error) {
        console.error('Error handling call accepted:', error);
      }
    };

    const handleCallRejected = () => {
      setCallStatus('idle');
      endCall();
    };

    const handleCallEnded = () => {
      setCallStatus('idle');
      endCall();
    };

    const handleIceCandidate = async (data) => {
      if (peerConnectionRef.current && data.candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        } catch (error) {
          console.error('Error adding ICE candidate:', error);
        }
      }
    };

    const handleCallFailed = (data) => {
      console.error('Call failed:', data.reason);
      setCallStatus('idle');
      endCall();
    };

    socket.on('call-accepted', handleCallAccepted);
    socket.on('call-rejected', handleCallRejected);
    socket.on('call-ended', handleCallEnded);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('call-failed', handleCallFailed);

    return () => {
      socket.off('call-accepted', handleCallAccepted);
      socket.off('call-rejected', handleCallRejected);
      socket.off('call-ended', handleCallEnded);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('call-failed', handleCallFailed);
    };
  }, [socket, defaultRemoteUserId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endCall();
    };
  }, []);

  // Call duration timer
  useEffect(() => {
    let interval = null;
    if (callStatus === 'active' && isCallActive) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callStatus, isCallActive]);

  // Update remote audio element when stream changes
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      console.log('=== Updating remote audio element ===');
      console.log('Remote stream:', remoteStream);
      console.log('Stream tracks:', remoteStream.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState
      })));
      
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.muted = false;
      remoteVideoRef.current.volume = 1.0;
      
      const playAudio = async () => {
        try {
          await remoteVideoRef.current.play();
          console.log('✅ Remote audio playing from useEffect');
        } catch (error) {
          console.error('❌ Error playing remote audio in useEffect:', error);
          // Retry after user interaction or delay
          setTimeout(() => {
            if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
              remoteVideoRef.current.play().catch(e => console.error('Retry error:', e));
            }
          }, 1000);
        }
      };
      
      // Try to play when metadata is loaded
      remoteVideoRef.current.onloadedmetadata = () => {
        console.log('Remote audio metadata loaded in useEffect');
        playAudio();
      };
      
      // Also try immediately
      if (remoteVideoRef.current.readyState >= 2) {
        playAudio();
      }
    }
  }, [remoteStream]);

  // Toggle mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const newMutedState = !isMuted;
        audioTracks.forEach(track => {
          track.enabled = !newMutedState;
        });
        setIsMuted(newMutedState);
        console.log('Microphone muted:', newMutedState);
      }
    }
  };

  return {
    localStream,
    remoteStream,
    isCallActive,
    callStatus,
    callDuration,
    connectionState,
    isMuted,
    localVideoRef,
    remoteVideoRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute
  };
};

export default useWebRTC;

