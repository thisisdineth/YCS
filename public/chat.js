// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase, ref, set, get, push, onValue, remove, serverTimestamp, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { filterBadWords } from './badword.js';  // Import the bad words filtering function

// Initialize Firebase
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
let currentChatRoom = null;
let typingRef = null;
let replyMessageId = null;
let inactivityTimeout = null;
let chatLeaveTimeout = null;

// Anonymous Sign In
signInAnonymously(auth).catch((error) => {
    console.error("Error signing in anonymously:", error);
});

// Loading screen
window.addEventListener('load', function() {
    setTimeout(function() {
        document.body.classList.add('loaded');
    }, 1000); 
});

// Authentication state
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        updateUserStatus('available');
        setActiveUser();
        updateActiveUsersCount();

        const userChatRoomRef = ref(db, `users/${currentUser.uid}/currentChatRoom`);
        onValue(userChatRoomRef, (snapshot) => {
            if (snapshot.exists()) {
                currentChatRoom = snapshot.val();
                redirectToChatRoom();
                listenForMessages();
                listenForTyping();
                resetInactivityTimer();
            }
        });
    }
});

// Track user status
function updateUserStatus(status) {
    const userRef = ref(db, `activeUsers/${currentUser.uid}`);
    set(userRef, {
        uid: currentUser.uid,
        status: status,
        timestamp: serverTimestamp()
    });
}

// Active users count
function updateActiveUsersCount() {
    const activeUsersRef = ref(db, 'activeUsers');
    onValue(activeUsersRef, (snapshot) => {
        const activeUsers = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        document.getElementById('active-user-count').textContent = activeUsers;
    });
}

// Set active user and manage disconnection
function setActiveUser() {
    const userRef = ref(db, `activeUsers/${currentUser.uid}`);
    set(userRef, {
        uid: currentUser.uid,
        status: "available",
        timestamp: serverTimestamp()
    });

    onDisconnect(userRef).remove().then(() => {
        console.log("User disconnected.");
        updateActiveUsersCount();
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);
}

// Handle inactivity
function handleVisibilityChange() {
    if (document.hidden) {
        markUserInactive();
    } else {
        markUserActive();
    }
}

function markUserInactive() {
    updateUserStatus('available');
    clearTimeout(inactivityTimeout);
    clearTimeout(chatLeaveTimeout);
}

function markUserActive() {
    updateUserStatus('available');
    resetInactivityTimer();
}

function resetInactivityTimer() {
    clearTimeout(chatLeaveTimeout);
    chatLeaveTimeout = setTimeout(leaveChatRoom, 120000);
}

// Start chat with random user
async function startChat() {
    try {
        const activeUsersRef = ref(db, 'activeUsers');
        const snapshot = await get(activeUsersRef);

        if (snapshot.exists()) {
            const activeUsers = snapshot.val();
            const availableUsers = Object.keys(activeUsers)
                .filter(uid => uid !== currentUser.uid && activeUsers[uid].status === 'available');

            if (availableUsers.length > 0) {
                const randomUserId = availableUsers[Math.floor(Math.random() * availableUsers.length)];
                await connectToChatRoom(randomUserId);
            } else {
                alert("No available users to start a chat. Please wait...");
            }
        } else {
            alert("No active users available.");
        }
    } catch (error) {
        console.error("Error starting chat:", error);
    }
}

// Connect to chat room or create one
async function connectToChatRoom(partnerUid) {
    if (partnerUid === currentUser.uid) {
        console.error("Cannot connect to a chat room with yourself.");
        return;
    }

    const chatRoomsRef = ref(db, 'chatRooms');
    const userChatRoomRef = ref(db, `users/${currentUser.uid}/currentChatRoom`);
    const partnerChatRoomRef = ref(db, `users/${partnerUid}/currentChatRoom`);

    let existingChatRoom = null;
    const existingChatRoomsSnapshot = await get(chatRoomsRef);
    if (existingChatRoomsSnapshot.exists()) {
        existingChatRoomsSnapshot.forEach(roomSnapshot => {
            const roomData = roomSnapshot.val();
            if (roomData.users && roomData.users.includes(currentUser.uid) && roomData.users.includes(partnerUid)) {
                existingChatRoom = roomSnapshot.key;
            }
        });
    }

    if (existingChatRoom) {
        currentChatRoom = existingChatRoom;
        await set(userChatRoomRef, currentChatRoom);
        await set(partnerChatRoomRef, currentChatRoom);
    } else {
        const newChatRoomRef = push(chatRoomsRef);
        currentChatRoom = newChatRoomRef.key;
        await set(newChatRoomRef, {
            users: [currentUser.uid, partnerUid],
            messages: []
        });
        await set(userChatRoomRef, currentChatRoom);
        await set(partnerChatRoomRef, currentChatRoom);
    }

    updateUserStatus('busy');
    await set(ref(db, `activeUsers/${partnerUid}/status`), 'busy');
    console.log(`Connected to chat room with ID: ${currentChatRoom}`);
    redirectToChatRoom();
    listenForMessages();
    listenForTyping();
    resetInactivityTimer();
}

// Chat room redirection
function redirectToChatRoom() {
    alert("Successfully connected to a user! You can now start chatting.");
    document.getElementById('chat-container').style.display = 'block';
}

// Message listening
function listenForMessages() {
    if (!currentChatRoom) return;
    const chatMessagesRef = ref(db, `chatRooms/${currentChatRoom}/messages`);
    onValue(chatMessagesRef, (snapshot) => {
        const chatBox = document.getElementById('chat-box');
        chatBox.innerHTML = '';
        snapshot.forEach(childSnapshot => {
            const messageData = childSnapshot.val();
            const messageElement = document.createElement('div');
            messageElement.classList.add('message');
            messageElement.classList.add(messageData.uid === currentUser.uid ? 'you' : 'stranger');

            const messageText = document.createElement('div');
            messageText.classList.add('message-text');
            messageText.innerHTML = filterBadWords(formatMathExpression(messageData.message));
            messageElement.appendChild(messageText);

            if (messageData.replyTo) {
                const replyElement = document.createElement('div');
                replyElement.classList.add('reply');
                replyElement.innerHTML = `Replying to: ${filterBadWords(formatMathExpression(messageData.replyTo.message))}`;
                messageElement.appendChild(replyElement);
            }

            chatBox.appendChild(messageElement);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

// Typing status
function listenForTyping() {
    if (!currentChatRoom) return;
    typingRef = ref(db, `chatRooms/${currentChatRoom}/typing`);
    onValue(typingRef, (snapshot) => {
        const typingData = snapshot.val();
        document.getElementById('typing-indicator').textContent = typingData && typingData.uid !== currentUser.uid
            ? "Stranger is typing..."
            : "";
    });
}

// ** New handleTyping function **
function handleTyping() {
    if (!currentChatRoom) return;
    const typingRef = ref(db, `chatRooms/${currentChatRoom}/typing/${currentUser.uid}`);
    set(typingRef, {
        uid: currentUser.uid,
        timestamp: serverTimestamp()
    });
    resetInactivityTimer();  // Reset timer on typing activity
}

// Send message
function sendMessage() {
    const chatInput = document.getElementById('chat-input').value;
    if (chatInput.trim() === '') return;

    const chatMessagesRef = ref(db, `chatRooms/${currentChatRoom}/messages`);
    const newMessageRef = push(chatMessagesRef);

    set(newMessageRef, {
        uid: currentUser.uid,
        message: filterBadWords(formatMathExpression(chatInput)),
        replyTo: replyMessageId ? { message: replyMessageId } : null,
        timestamp: serverTimestamp()
    }).then(() => {
        document.getElementById('chat-input').value = '';
        document.getElementById('chat-input').placeholder = 'You: Type a message...';
        replyMessageId = null;
        handleTyping();
        const chatBox = document.getElementById('chat-box');
        chatBox.scrollTop = chatBox.scrollHeight;
    }).catch((error) => {
        console.error("Error sending message:", error);
    });
}

// Leave chat room
async function leaveChatRoom() {
    if (currentChatRoom) {
        const chatRoomRef = ref(db, `chatRooms/${currentChatRoom}`);
        const skipMessageRef = push(ref(db, `chatRooms/${currentChatRoom}/messages`));
        await set(skipMessageRef, {
            uid: currentUser.uid,
            message: "The user has left the chat.",
            isSystemMessage: true,
            timestamp: serverTimestamp()
        });

        setTimeout(async () => {
            await remove(chatRoomRef);
            currentChatRoom = null;
            document.getElementById('chat-box').innerHTML = '';
            document.getElementById('chat-container').style.display = 'none';
            alert("You have left the chat.");
            updateUserStatus('available');
        }, 500);
    }
}

// Format math expressions
function formatMathExpression(input) {
    input = input.replace(/\^(\d+)/g, (_, exp) => `<sup>${exp}</sup>`);
    input = input.replace(/\*/g, '×');
    input = input.replace(/\//g, '÷');
    return input;
}

// Event Listeners
document.getElementById('new-chat-btn').addEventListener('click', startChat);
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('skip-btn').addEventListener('click', leaveChatRoom);
document.getElementById('chat-input').addEventListener('input', handleTyping);
document.getElementById('chat-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage();
    }
});

setInterval(() => {
    document.getElementById('local-time').textContent = new Date().toLocaleTimeString();
}, 1000);