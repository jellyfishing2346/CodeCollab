'use client'; // This directive marks the component as a Client Component

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ErrorBoundary component for global error handling
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }
  componentDidCatch(error: any, errorInfo: any) {
    // You can log error to an external service here
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold text-red-400 mb-4">Something went wrong.</h1>
          <p className="text-lg">Please refresh the page or contact support.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, Auth } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, setDoc, Firestore } from 'firebase/firestore';
import Editor from '@monaco-editor/react'; // Import Monaco Editor
import Login from './Login'; // Import Login component
import io from 'socket.io-client'; // Import Socket.IO client
import type { Socket } from 'socket.io-client'; // Import Socket type at the top

// Declare global variables for Canvas environment if present
declare const __app_id: string | undefined;
declare const __firebase_config: string | undefined;
declare const __initial_auth_token: string | undefined;

// Ensure global variables are defined or provide fallbacks for local development
const appId: string = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// IMPORTANT: Replace this placeholder object with your actual Firebase project configuration.
// You can find this in your Firebase Console: Project settings -> General -> Your apps -> Web app config.
const firebaseConfig: object = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyAiHVVlhEjQaAWlbrJT6JXXiwsuU44rzLU", // <--- REPLACE THIS WITH YOUR ACTUAL API KEY FROM FIREBASE CONSOLE
  authDomain: "codecollab-c049d.firebaseapp.com", // <--- REPLACE THIS WITH YOUR ACTUAL AUTH DOMAIN FROM FIREBASE CONSOLE
  projectId: "codecollab-c049d", // <--- REPLACE THIS WITH YOUR ACTUAL PROJECT ID FROM FIREBASE CONSOLE
  storageBucket: "codecollab-c049d.firebasestorage.app", // <--- REPLACE THIS WITH YOUR ACTUAL STORAGE BUCKET FROM FIREBASE CONSOLE
  messagingSenderId: "858232866707", // <--- REPLACE THIS WITH YOUR ACTUAL MESSAGING SENDER ID FROM FIREBASE CONSOLE
  appId: "1:858232866707:web:f3f8ec9dd34d355a9dca66", // <--- REPLACE THIS WITH YOUR ACTUAL APP ID FROM FIREBASE CONSOLE
  measurementId: "G-64KBHZ1WVB" // <--- ADDED YOUR MEASUREMENT ID
};

const initialAuthToken: string | null = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase outside of the component to avoid re-initialization
let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} catch (error) {
  console.error("Firebase initialization error:", error);
  // Handle cases where firebaseConfig might be empty or invalid during local dev without Canvas env
}

const App = () => {
  // Loading state for async actions
  const [loading, setLoading] = useState<boolean>(false);
  // Helper: Show error banner for socket errors
  // (moved below socketStatus declaration)
  // State for the code editor content
  const [code, setCode] = useState<string>('// Start coding here!\nfunction helloWorld() {\n  console.log("Hello, CodeCollab!");\n}');
  // State for language selection
  const [editorLanguage, setEditorLanguage] = useState<string>('javascript');
  // State for user presence
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  // State to manage video chat enablement
  const [videoEnabled, setVideoEnabled] = useState<boolean>(false);
  // Ref for the video element to display local camera stream
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStream = useRef<MediaStream | null>(null); // To hold the local media stream

  // WebRTC related states and refs for multiple peers
  const [peerConnections, setPeerConnections] = useState<Map<string, RTCPeerConnection>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [activePeers, setActivePeers] = useState<string[]>([]); // List of other userIds in the session

  const socket = useRef<ReturnType<typeof io> | null>(null); // Changed from ws to socket
  // Ref for the Socket.IO connection instance
  // Ref for the Socket.IO connection instance
  const [sessionId, setSessionId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sessionId') || '';
    }
    return '';
  });
  // State for the input field for session ID
  const [inputSessionId, setInputSessionId] = useState<string>('');
  const [sessionError, setSessionError] = useState<string>('');
  // State for Socket.IO connection status
  const [socketStatus, setSocketStatus] = useState<string>('Disconnected'); // Changed from wsStatus
  // Helper: Show error banner for socket errors
  const isSocketError = socketStatus && socketStatus.toLowerCase().includes('error');

  // State for user ID and auth readiness
  const [userId, setUserId] = useState<string>('');
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  // New: State for Firebase user
  const [user, setUser] = useState<any>(null);

  // Logout handler
  const handleLogout = async () => {
    if (auth) {
      await auth.signOut();
      setUser(null);
      setUserId('');
      setIsAuthReady(false);
    }
  };

  // Firebase Initialization and Authentication Listener
  useEffect(() => {
    if (!app || !db || !auth) {
      console.error("Firebase not initialized. Check firebaseConfig.");
      return;
    }

    const setupFirebase = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Firebase authentication error:", error);
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(!!user);
      if (user) {
        setUserId(user.uid);
        console.log("User authenticated:", user.uid);
      } else {
        setUserId(crypto.randomUUID());
        console.log("No user authenticated, using anonymous ID.");
      }
    });

    setupFirebase();
    return () => unsubscribeAuth();
  }, [initialAuthToken]);

  // Function to initialize WebRTC for a specific peer
  const initWebRTCForPeer = useCallback(async (remotePeerId: string, isOfferer: boolean) => {
    if (!userId || !sessionId || !socket.current || !socket.current.connected) { // Check socket.io connection
      console.log("Cannot init WebRTC: Socket not connected or userId/sessionId missing.");
      return;
    }

    // If a peer connection already exists for this remotePeerId, return it
    let pc = peerConnections.get(remotePeerId);
    if (pc) {
      console.log(`PeerConnection already exists for ${remotePeerId}.`);
      return pc;
    }

    // Configuration for STUN/TURN servers
    const iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    pc = new RTCPeerConnection(iceServers);
        setSocketStatus('Connected');
    // Add to peerConnections map
    setPeerConnections(prev => new Map(prev).set(remotePeerId, pc!));

    // Add local stream tracks to the peer connection
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => pc!.addTrack(track, localStream.current!));
    }

    // Handle incoming tracks from remote peer
    // Handle incoming tracks from remote peer
    pc.ontrack = (event: RTCTrackEvent) => {
      if (event && event.streams && event.streams[0]) {
        console.log(`Remote track received from ${remotePeerId}:`, event.streams[0]);
        setRemoteStreams(prev => new Map(prev).set(remotePeerId, event.streams[0]));
      }
    };

    // Handle ICE candidates (network information)
    pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        console.log(`Sending ICE candidate to ${remotePeerId}:`, event.candidate);
        socket.current?.emit('iceCandidate', { // Use socket.emit
          sessionId: sessionId,
          senderId: userId,
          candidate: event.candidate,
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${remotePeerId}:`, pc!.iceConnectionState);
      if (pc!.iceConnectionState === 'disconnected' || pc!.iceConnectionState === 'failed' || pc!.iceConnectionState === 'closed') {
      setSocketStatus('Peer disconnected or connection failed.');
      setPeerConnections(prev => {
        const newMap = new Map(prev);
        newMap.delete(remotePeerId);
        return newMap;
      });
      setRemoteStreams(prev => {
        const newMap = new Map(prev);
        newMap.delete(remotePeerId);
        return newMap;
      });
      // Also remove from activePeers if disconnected
      setActivePeers(prev => prev.filter(id => id !== remotePeerId));
      }
    };

    if (isOfferer) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log(`Sending WebRTC offer to ${remotePeerId}:`, offer);
        socket.current?.emit('webrtcOffer', { // Use socket.emit
          sessionId: sessionId,
          senderId: userId,
          targetUserId: remotePeerId,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.error("Error creating WebRTC offer:", err);
      }
    }
    return pc;
  }, [userId, sessionId, peerConnections, localStream, socket]); // Added socket to dependencies

  // Socket.IO Connection and Message Handling
  useEffect(() => {
    let isMounted = true;
    const socketUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL;

    // Condition to attempt connection: URL, userId, and sessionId must be present
    if (!socketUrl || !userId || !sessionId) {
      setSocketStatus('Waiting for session ID...');
      if (socket.current && socket.current.connected) {
        socket.current.disconnect();
        socket.current = null;
      }
      return;
    }

    if (socket.current && socket.current.connected && socket.current.io.uri === socketUrl) {
      setSocketStatus('Connected');
      return;
    }

    if (socket.current && (!socket.current.connected || socket.current.io.uri !== socketUrl)) {
      socket.current.disconnect();
      socket.current = null;
    }

    if (!socket.current) {
      setSocketStatus('Connecting...');
      socket.current = io(socketUrl, {
        path: '/ws',
        transports: ['websocket', 'polling'],
        autoConnect: false
      });

      socket.current.on('connect', () => {
        if (isMounted) setSocketStatus('Connected');
        console.log('Connected to Socket.IO server.');
        socket.current?.emit('joinSession', {
          sessionId: sessionId,
          userId: userId
        });
      });

      socket.current.on('disconnect', (reason: string) => {
        if (isMounted) setSocketStatus('Disconnected');
        console.log('Disconnected from Socket.IO server:', reason);
        peerConnections.forEach(pc => pc.close());
        setPeerConnections(new Map());
        localStream.current?.getTracks().forEach(track => track.stop());
        localStream.current = null;
        setRemoteStreams(new Map());
        setActivePeers([]);
      });

      socket.current.on('connect_error', (error: Error) => {
        if (isMounted) setSocketStatus('Error');
        console.error('Socket.IO connection error:', error);
        console.error('Socket.IO connection error message:', error.message);
        // @ts-ignore
        console.error('Socket.IO connection error description:', (error as any).description);
      });

      socket.current.on('codeUpdate', (data: { sessionId: string; code: string; }) => {
        if (isMounted && data.sessionId === sessionId && data.code !== code) {
          setCode(data.code);
          console.log('Received code update from server.');
        }
      });

      socket.current.on('peerJoined', (data: { sessionId: string; newPeerId: string; users?: string[] }) => {
        if (isMounted && data.sessionId === sessionId && data.newPeerId !== userId && !activePeers.includes(data.newPeerId)) {
          console.log(`Peer ${data.newPeerId} joined the session.`);
          setActivePeers(prev => [...prev, data.newPeerId]);
          if (videoEnabled && localStream.current) {
            initWebRTCForPeer(data.newPeerId, true);
          }
        }
        // Update online users if provided
        if (data.users) {
          setOnlineUsers(data.users);
        }
      });

      socket.current.on('existingPeers', (data: { sessionId: string; peers: string[]; users?: string[] }) => {
        if (isMounted && data.sessionId === sessionId) {
          const newActivePeers = data.peers.filter(peerId => peerId !== userId && !activePeers.includes(peerId));
          if (newActivePeers.length > 0) {
            console.log('Received existing peers:', newActivePeers);
            setActivePeers(prev => [...prev, ...newActivePeers]);
            if (videoEnabled && localStream.current) {
              newActivePeers.forEach(peerId => {
                initWebRTCForPeer(peerId, true);
              });
            }
          }
          // Update online users if provided
          if (data.users) {
            setOnlineUsers(data.users);
          }
        }
      });

      socket.current.on('peerLeft', (data: { sessionId: string; peerId: string; }) => {
        if (isMounted && data.sessionId === sessionId && data.peerId !== userId) {
          console.log(`Peer ${data.peerId} left the session.`);
          setActivePeers(prev => prev.filter(id => id !== data.peerId));
          setPeerConnections(prev => {
            const newMap = new Map(prev);
            newMap.delete(data.peerId);
            return newMap;
          });
          setRemoteStreams(prev => {
            const newMap = new Map(prev);
            newMap.delete(data.peerId);
            return newMap;
          });
        }
      });

      socket.current.on('webrtcOffer', async (data: { sessionId: string; senderId: string; sdp: RTCSessionDescriptionInit; }) => {
        if (isMounted && data.sessionId === sessionId && data.senderId !== userId) {
          console.log(`Received WebRTC offer from ${data.senderId}:`, data.sdp);
          let pc = peerConnections.get(data.senderId);
          if (!pc) {
            pc = await initWebRTCForPeer(data.senderId, false);
          }
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.current?.emit('webrtcAnswer', {
              sessionId: sessionId,
              senderId: userId,
              targetUserId: data.senderId,
              sdp: pc.localDescription,
            });
            console.log(`Sent WebRTC answer to ${data.senderId}.`);
          }
        }
      });

      socket.current.on('webrtcAnswer', async (data: { sessionId: string; senderId: string; sdp: RTCSessionDescriptionInit; }) => {
        if (isMounted && data.sessionId === sessionId && data.senderId !== userId) {
          console.log(`Received WebRTC answer from ${data.senderId}:`, data.sdp);
          const pc = peerConnections.get(data.senderId);
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          }
        }
      });

      socket.current.on('iceCandidate', async (data: { sessionId: string; senderId: string; candidate: RTCIceCandidateInit; }) => {
        if (isMounted && data.sessionId === sessionId && data.senderId !== userId) {
          console.log(`Received ICE candidate from ${data.senderId}:`, data.candidate);
          const pc = peerConnections.get(data.senderId);
          if (pc) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
              console.error(`Error adding received ICE candidate from ${data.senderId}`, e);
            }
          }
        }
      });

      socket.current.on('error', (error: Error) => {
        if (isMounted) setSocketStatus(`Error: ${error.message}`);
        console.error('Socket.IO generic error:', error);
      });

      socket.current.connect();
    }

    return () => {
  isMounted = false;
  if (socket.current && socket.current.connected) {
    socket.current.disconnect();
    socket.current = null;
  }
  peerConnections.forEach(pc => pc.close());
  if (localStream.current) {
    localStream.current.getTracks().forEach(track => track.stop());
    localStream.current = null;
  }
  // Do NOT call setPeerConnections, setRemoteStreams, or setActivePeers here!
};
  }, [userId, sessionId, code, peerConnections, initWebRTCForPeer, videoEnabled, activePeers, localStream]);

  // Firestore Listener for Code Changes (Simulated Collaboration - can be removed if Socket.IO is primary)
  // Use a ref to hold the latest code value for comparison
  const codeRef = useRef(code);
  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => {
    if (!isAuthReady || !db || !userId || !sessionId) {
      console.log("Waiting for auth readiness, db/userId, or sessionId to be available for Firestore listener.");
      return;
    }

    const sessionDocRef = doc(db, `artifacts/${appId}/public/data/codecollab_sessions`, sessionId);

    const unsubscribeSnapshot = onSnapshot(sessionDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.content) {
          console.log("Fetched code from Firestore (shared session):", data.content);
          if (data.content !== codeRef.current) {
            setCode(data.content);
          }
        }
      } else {
        console.log("No code found for this session, initializing with default.");
        setDoc(sessionDocRef, { content: codeRef.current, createdAt: new Date().toISOString() }, { merge: true }).catch(e => console.error("Error setting initial session doc:", e));
      }
    }, (error) => {
      console.error("Error listening to Firestore (shared session):", error);
    });

    return () => unsubscribeSnapshot();
  }, [isAuthReady, db, userId, sessionId]);

  // Simple code sanitizer to prevent XSS in code editor
  const sanitizeCode = (input: string) => {
    // Remove script tags and event handlers
    let sanitized = input.replace(/<script.*?>.*?<\/script>/gi, '')
                        .replace(/on\w+=['"].*?['"]/gi, '');
    // Remove all HTML tags
    sanitized = sanitized.replace(/<[^>]+>/g, '');
    // Escape angle brackets
    sanitized = sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return sanitized;
  };

  const handleCodeChange = async (value?: string) => {
    const newCode = value || '';
    const safeCode = sanitizeCode(newCode);
    setCode(safeCode);

    if (socket.current && socket.current.connected) { // Check socket.io connection
      socket.current.emit('codeChange', { // Use socket.emit
        sessionId: sessionId,
        code: safeCode,
        userId: userId
      });
    }

    if (db && sessionId) {
      const sessionDocRef = doc(db, `artifacts/${appId}/public/data/codecollab_sessions`, sessionId);
      try {
        await setDoc(sessionDocRef, { content: safeCode, lastModified: new Date().toISOString() }, { merge: true });
        console.log("Code updated in Firestore (shared session).");
      } catch (error) {
        console.error("Error updating code in Firestore (shared session):", error);
      }
    }
  };

  const toggleVideo = () => {
    setVideoEnabled(prev => {
      const newState = !prev;
      if (newState) {
        // When enabling video, get local stream and initiate connections to existing peers
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          .then((stream: MediaStream) => {
            localStream.current = stream;
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = localStream.current;
            }
            // For each active peer, initiate WebRTC connection
            activePeers.forEach(peerId => {
              initWebRTCForPeer(peerId, true); // True because we are initiating the offer
            });
          })
          .catch((err: Error) => {
            console.error("Error accessing media devices:", err);
            setVideoEnabled(false); // Disable video if media access fails
            // Show a user-friendly message
          });
      } else {
        // Stop all tracks and close all peer connections
        if (localStream.current) {
          localStream.current.getTracks().forEach(track => track.stop());
          localStream.current = null;
          if (localVideoRef.current) localVideoRef.current.srcObject = null;
        }
        peerConnections.forEach(pc => pc.close());
        setPeerConnections(new Map());
        setRemoteStreams(new Map());
      }
      return newState;
    });
  };

  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0,
        v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const handleJoinSession = async () => {
    const trimmedId = inputSessionId.trim();
    if (!trimmedId) {
      setSessionError('Please enter a valid session ID to join.');
      return;
    }
    // Basic validation: session ID should be UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trimmedId)) {
      setSessionError('Session ID must be a valid UUID.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setSessionId(trimmedId);
      setCode('// Joining session: ' + trimmedId + '\n');
      setSessionError('');
      setLoading(false);
      if (typeof window !== 'undefined') {
        localStorage.setItem('sessionId', trimmedId);
      }
    }, 800); // Simulate async join
  };

  const handleCreateSession = async () => {
    setLoading(true);
    setTimeout(() => {
      const newId = generateUUID();
      setInputSessionId(newId);
      setSessionId(newId);
      setCode('// New session created: ' + newId + '\n');
      setSessionError('');
      setLoading(false);
      if (typeof window !== 'undefined') {
        localStorage.setItem('sessionId', newId);
      }
    }, 800); // Simulate async create
  };

  // ...existing code...
  if (!user) {
    return <Login onLogin={() => {}} />;
  }
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 font-inter flex flex-col items-center justify-center">
        <div className="flex flex-col items-center justify-center h-full">
          <svg className="animate-spin h-12 w-12 text-blue-400 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="text-lg font-semibold">Loading...</span>
        </div>
      </div>
    );
  }
  // ...existing code for app UI...
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-900 text-gray-100 font-inter flex flex-col" aria-label="CodeCollab Main Container">
        {/* Socket Error Banner */}
        {isSocketError && (
          <div className="w-full bg-red-700 text-white text-center py-2 font-semibold">
            {socketStatus}
          </div>
        )}
        {/* Header */}
        <header className="bg-gray-800 p-4 shadow-md flex justify-between items-center rounded-b-lg" aria-label="App Header">
          <h1 className="text-2xl font-bold text-blue-400" aria-label="App Title">CodeCollab</h1>
          <div className="flex items-center space-x-4" aria-label="Header Controls">
            <span className="text-sm text-gray-400">User ID: {userId || 'Loading...'}</span>
            {sessionId && (
              <span className="text-sm text-gray-400">Session ID: {sessionId}</span>
            )}
            <span className={`text-sm font-semibold ${socketStatus === 'Connected' ? 'text-green-400' : socketStatus === 'Disconnected' ? 'text-red-400' : 'text-yellow-400'}`}>
              Socket: {socketStatus}
            </span>
            {/* User Presence Indicator */}
            {sessionId && (
              <span className="text-sm text-blue-300">Online: {onlineUsers.length > 0 ? onlineUsers.length : activePeers.length + 1}</span>
            )}
            <button
              onClick={toggleVideo}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors duration-200 ${
                videoEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {videoEnabled ? 'Disable Video' : 'Enable Video'}
            </button>
            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg font-semibold bg-gray-700 hover:bg-gray-800 text-red-400 border border-red-400 ml-2"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex flex-1 p-4 space-x-4 overflow-hidden" aria-label="Main Content Area">
          {/* Session Management UI or Code Editor/Video Chat */}
          {!sessionId ? (
            <div className="flex flex-1 items-center justify-center bg-gray-800 rounded-lg shadow-lg p-8">
              <div className="flex flex-col items-center space-y-6 w-full max-w-md" aria-label="Session Management">
                <h2 className="text-3xl font-bold text-blue-400 mb-4">Start or Join a Session</h2>
                <input
                  type="text"
                  placeholder="Enter Session ID"
                  className="w-full p-3 rounded-lg bg-gray-700 text-gray-100 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={inputSessionId}
                  onChange={(e) => { setInputSessionId(e.target.value); setSessionError(''); }}
                  aria-label="Session ID Input"
                />
                {sessionError && (
                  <div className="w-full text-center text-red-400 text-sm mt-2">{sessionError}</div>
                )}
                <div className="flex space-x-4 w-full">
                  <button
                    onClick={handleJoinSession}
                    className="flex-1 px-6 py-3 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 transition-colors duration-200 shadow-md"
                    aria-label="Join Session Button"
                  >
                    Join Session
                  </button>
                  <button
                    onClick={handleCreateSession}
                    className="flex-1 px-6 py-3 rounded-lg font-semibold bg-purple-600 hover:bg-purple-700 transition-colors duration-200 shadow-md"
                    aria-label="Create New Session Button"
                  >
                    Create New Session
                  </button>
                </div>
                <p className="text-sm text-gray-400 mt-4 text-center">
                  Share the Session ID with others to collaborate in real-time!
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Code Editor Section */}
              <div className="flex-1 flex flex-col bg-gray-800 rounded-lg shadow-lg overflow-hidden" aria-label="Code Editor Section">
                <div className="p-3 bg-gray-700 text-gray-300 font-medium rounded-t-lg flex justify-between items-center" aria-label="Editor Header">
                  <h2 className="text-lg">Code Editor</h2>
                  {/* Language Selector */}
                  <select
                    className="ml-4 p-2 rounded bg-gray-600 text-gray-100 border border-gray-500"
                    value={editorLanguage}
                    onChange={e => setEditorLanguage(e.target.value)}
                    aria-label="Language Selector"
                  >
                    <option value="javascript">JavaScript</option>
                    <option value="typescript">TypeScript</option>
                    <option value="python">Python</option>
                    <option value="json">JSON</option>
                    <option value="markdown">Markdown</option>
                    <option value="html">HTML</option>
                  </select>
                </div>
                {/* Monaco Editor Component */}
                <Editor
                  height="100%" // Make editor fill its container
                  language={editorLanguage}
                  theme="vs-dark" // Dark theme
                  value={code} // Bind to your 'code' state
                  onChange={handleCodeChange} // Use the updated handler
                  options={{
                    minimap: { enabled: false }, // Disable minimap
                    fontSize: 14,
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>

              {/* Video Chat Section */}
              <div className="w-1/3 flex flex-col bg-gray-800 rounded-lg shadow-lg overflow-hidden" aria-label="Video Chat Section">
                <div className="p-3 bg-gray-700 text-gray-300 font-medium rounded-t-lg">
                  <h2 className="text-lg">Video Chat</h2>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center p-4 bg-gray-900 rounded-b-lg space-y-4">
                  {/* Local Video Stream */}
                  <div className="w-full relative bg-black rounded-lg overflow-hidden aspect-video">
                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover rounded-lg"></video>
                    <span className="absolute bottom-1 left-1 bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded-md">Local Stream</span>
                  </div>

                  {/* Remote Video Streams */}
                  {videoEnabled && remoteStreams.size > 0 ? (
                    Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
                      <div key={peerId} className="w-full relative bg-black rounded-lg overflow-hidden aspect-video">
                        {/* Use a callback ref to set srcObject dynamically */}
                        <video ref={(el) => { if (el) el.srcObject = stream; }} autoPlay playsInline className="w-full h-full object-cover rounded-lg border-2 border-blue-500"></video>
                        <span className="absolute bottom-1 left-1 bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded-md">Remote Stream ({peerId.substring(0, 6)}...)</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-400 text-center flex items-center justify-center h-full">
                      {videoEnabled ? "Waiting for remote peer(s)..." : "Click 'Enable Video' to start video chat."}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      {/* Footer with Privacy Policy/Terms */}
      <footer className="bg-gray-800 p-4 text-center text-gray-400 text-sm mt-auto" aria-label="App Footer">
        <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-400">Privacy Policy</a>
        {' | '}
        <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-400">Terms of Service</a>
      </footer>
    </div>
    </ErrorBoundary>
  );
};

export default App;
