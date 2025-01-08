import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, remove, get, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBTonYWFHgcxcVi1BBVeZkx823CfuT7CgM",
    authDomain: "findaguest-3024b.firebaseapp.com",
    databaseURL: "https://findaguest-3024b-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "findaguest-3024b",
    storageBucket: "findaguest-3024b.appspot.com",
    messagingSenderId: "292838904473",
    appId: "1:292838904473:web:65cc9227374cb898581e08",
    measurementId: "G-WPJK68Y0XZ"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let currentUser = null;
let currentVideoRoom = null;
let localStream = null;
let peerConnection = null;
let partnerUid = null;
let videoEnabled = true;

// STUN and TURN servers
const servers = {
    iceServers: [
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        {
            urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
            username: 'webrtc',
            credential: 'webrtc'
        }
    ],
};

// Sign in anonymously
signInAnonymously(auth).catch((error) => {
    console.error("Error signing in anonymously:", error);
});



onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        console.log("User signed in:", user.uid);
        setActiveUser();
        updateLocalTime();
        setInterval(updateLocalTime, 1000); // Update time every second
    }
});


// active user setuping option
function setActiveUser() {
    const activeUsersRef = ref(db, `videoActiveUsers/${currentUser.uid}`);
    set(activeUsersRef, {
        uid: currentUser.uid,
        timestamp: new Date().toISOString()
    }).catch((error) => {
        console.error("Error setting active user in Firebase:", error);
    });

    onValue(ref(db, 'videoActiveUsers'), (snapshot) => {
        const activeUsers = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        document.getElementById('active-user-count').textContent = activeUsers;
    });

    onDisconnect(activeUsersRef).remove().catch((error) => {
        console.error("Error during disconnection cleanup:", error);
    });
}

// Update local time display
function updateLocalTime() {
    const now = new Date();
    document.getElementById('local-time').textContent = now.toLocaleTimeString();
}

// Start local stream and setup WebRTC This is not working yet
async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const localVideo = document.getElementById('local-video');
        localVideo.srcObject = localStream;

        document.getElementById('find-new-user-btn').disabled = false;
        document.getElementById('toggle-video-btn').disabled = false;

        if (peerConnection) {
            // Add local stream tracks to peer connection
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }
    } catch (error) {
        console.error("Error accessing media devices.", error);
        alert("Could not access your camera or microphone. Please check your permissions.");
    }
}

// Connect to a new video room with a random partner
async function findNewGuest() {
    showLoading(true);  // Show loading when searching for a partner

    if (peerConnection) {
        endVideoChat();
    }

    try {
        peerConnection = new RTCPeerConnection(servers);
        peerConnection.onicecandidate = handleICECandidateEvent;
        peerConnection.ontrack = handleTrackEvent;

        const activeUsersRef = ref(db, 'videoActiveUsers');
        const activeUsersSnapshot = await get(activeUsersRef);
        const activeUsers = activeUsersSnapshot.exists() ? Object.keys(activeUsersSnapshot.val()).filter(uid => uid !== currentUser.uid) : [];
        
        if (activeUsers.length > 0) {
            partnerUid = activeUsers[Math.floor(Math.random() * activeUsers.length)];
            const videoRoomsRef = ref(db, 'videoRooms');
            const newVideoRoomRef = push(videoRoomsRef);
            currentVideoRoom = newVideoRoomRef.key;

            await set(newVideoRoomRef, {
                users: [currentUser.uid, partnerUid],
            });

            setupWebRTC(newVideoRoomRef);
            startLocalStream();

            document.getElementById('leave-chat-btn').disabled = false;
            document.getElementById('find-new-user-btn').disabled = true;
        } else {
            alert("No other active users found. Please try again later.");
            showLoading(false); 
        }
    } catch (error) {
        console.error("Error finding a new guest:", error);
        alert("An error occurred while trying to find a new guest. Please try again.");
        showLoading(false);
    }
}

// Modularized WebRTC setup function
async function setupWebRTC(roomRef) {
    try {
        const roomSnapshot = await get(roomRef);

        if (roomSnapshot.exists()) {
            const roomData = roomSnapshot.val();
            if (roomData.offer) {
                await handleReceivedOffer(roomData.offer, roomRef);
            } else {
                await createAndSendOffer(roomRef);
            }
        }

        monitorAnswer(roomRef);
        monitorICECandidates(roomRef);
    } catch (error) {
        console.error("Error during WebRTC setup:", error);
    }
}

async function handleReceivedOffer(offer, roomRef) {
    console.log("Setting remote description with received offer.");
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    console.log("Sending answer.");
    await set(ref(db, `${roomRef.key}/answer`), answer);
}

async function createAndSendOffer(roomRef) {
    console.log("Creating offer.");
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    console.log("Sending offer.");
    await set(ref(db, `${roomRef.key}/offer`), offer);
}

// Monitor for answer from the partner
function monitorAnswer(roomRef) {
    onValue(ref(db, `${roomRef.key}/answer`), async (snapshot) => {
        if (snapshot.exists() && !peerConnection.currentRemoteDescription) {
            console.log("Setting remote description with received answer.");
            const answer = snapshot.val();
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    });
}

// Monitor ICE candidates
function monitorICECandidates(roomRef) {
    onValue(ref(db, `${roomRef.key}/iceCandidates`), (snapshot) => {
        if (snapshot.exists()) {
            snapshot.forEach(async (iceSnapshot) => {
                if (iceSnapshot.val()) {
                    try {
                        console.log("Adding ICE candidate.");
                        await peerConnection.addIceCandidate(new RTCIceCandidate(iceSnapshot.val()));
                    } catch (e) {
                        console.error("Error adding received ice candidate", e);
                    }
                }
            });
        }
    });
}

function handleICECandidateEvent(event) {
    if (event.candidate) {
        console.log("Sending ICE candidate.");
        const roomRef = ref(db, `videoRooms/${currentVideoRoom}/iceCandidates`);
        set(push(roomRef), event.candidate).catch((error) => {
            console.error("Error sending ICE candidate:", error);
        });
    }
}

function handleTrackEvent(event) {
    console.log("Received remote track.");
    const remoteVideo = document.getElementById('remote-video');
    if (remoteVideo) {
        remoteVideo.srcObject = event.streams[0]; // Ensure the first stream is used
    }
    document.getElementById('status').textContent = "Stranger successfully connected!";
    showLoading(false);  // Hide loading once connected
}

// End the video chat and stop the local stream
function endVideoChat() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    currentVideoRoom = null;
    partnerUid = null;
    document.getElementById('remote-video').srcObject = null;
    document.getElementById('local-video').srcObject = null;
    document.getElementById('leave-chat-btn').disabled = true;
    document.getElementById('find-new-user-btn').disabled = false;
    document.getElementById('status').textContent = "";
}

// Toggle video on/off
function toggleVideo() {
    if (localStream) {
        videoEnabled = !videoEnabled;
        localStream.getVideoTracks().forEach(track => {
            track.enabled = videoEnabled;
        });

        const toggleButton = document.getElementById('toggle-video-btn');
        toggleButton.textContent = videoEnabled ? 'Turn Off Video' : 'Turn On Video';
    }
}

// Show or hide the loading container
function showLoading(show) {
    const loadingContainer = document.getElementById('loading-container');
    loadingContainer.style.display = show ? 'flex' : 'none';
}

// Event listeners
document.getElementById('find-new-user-btn').addEventListener('click', findNewGuest);
document.getElementById('leave-chat-btn').addEventListener('click', endVideoChat);
document.getElementById('toggle-video-btn').addEventListener('click', toggleVideo);

// Start the local stream on page load
startLocalStream();
