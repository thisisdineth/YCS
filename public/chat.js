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

// Global Variables
let currentUser = null;           // Stores the current authenticated user
let currentChatRoom = null;       // Stores the active chat room ID
let typingTimeout = null;         // Timer for clearing typing status
let typingIndicatorTimeout = null; // Timer for hiding the "Stranger is typing..." message
let replyMessageId = null;        // Stores the message ID for replying
let inactivityTimeout = null;     // Timer for detecting user inactivity
let chatLeaveTimeout = null;      // Timer for auto-leaving a chat room due to inactivity

// Anonymous Sign In
signInAnonymously(auth).catch((error) => {
    console.error("Error signing in anonymously:", error);
});

// Loading Screen Animation
window.addEventListener('load', function() {
    setTimeout(function() {
        document.body.classList.add('loaded'); // Adds a "loaded" class to start the app
    }, 1000); 
});

// Firebase Authentication State Listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        updateUserStatus('available'); // Mark user as available
        setActiveUser();              // Set the active user and manage disconnection
        updateActiveUsersCount();     // Display the current count of active users

        // Listen for changes to the user's current chat room
        const userChatRoomRef = ref(db, `users/${currentUser.uid}/currentChatRoom`);
        onValue(userChatRoomRef, (snapshot) => {
            if (snapshot.exists()) {
                currentChatRoom = snapshot.val();
                redirectToChatRoom();     // Display chat room interface
                listenForMessages();      // Listen for incoming messages
                listenForTyping();        // Listen for typing status updates
                resetInactivityTimer();   // Reset inactivity timer
            }
        });
    }
});

// Update User Status in the Database
function updateUserStatus(status) {
    const userRef = ref(db, `activeUsers/${currentUser.uid}`);
    set(userRef, {
        uid: currentUser.uid,
        status: status,
        timestamp: serverTimestamp()
    });
}

// Update Active Users Count on the UI
function updateActiveUsersCount() {
    const activeUsersRef = ref(db, 'activeUsers');
    onValue(activeUsersRef, (snapshot) => {
        const activeUsers = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        document.getElementById('active-user-count').textContent = activeUsers;
    });
}

// Set Active User and Manage Disconnection
function setActiveUser() {
    const userRef = ref(db, `activeUsers/${currentUser.uid}`);
    set(userRef, {
        uid: currentUser.uid,
        status: "available",
        timestamp: serverTimestamp()
    });

    // Remove user from active list on disconnection
    onDisconnect(userRef).remove().then(() => {
        console.log("User disconnected.");
        updateActiveUsersCount();
    });

    // Track visibility changes (e.g., tab changes)
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

// Handle Visibility Changes
function handleVisibilityChange() {
    if (document.hidden) {
        markUserInactive(); // Mark user as inactive when they leave the tab
    } else {
        markUserActive();   // Mark user as active when they return
    }
}

// Mark User as Inactive
function markUserInactive() {
    updateUserStatus('available');
    clearTimeout(inactivityTimeout);
    clearTimeout(chatLeaveTimeout);
}

// Mark User as Active
function markUserActive() {
    updateUserStatus('available');
    resetInactivityTimer();
}

// Reset Inactivity Timer
function resetInactivityTimer() {
    clearTimeout(chatLeaveTimeout);
    chatLeaveTimeout = setTimeout(leaveChatRoom, 120000); // Auto-leave after 2 minutes of inactivity
}

// Start Chat with a Random User
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

// Connect to a Chat Room or Create a New One
async function connectToChatRoom(partnerUid) {
    if (partnerUid === currentUser.uid) {
        console.error("Cannot connect to a chat room with yourself.");
        return;
    }

    const chatRoomsRef = ref(db, 'chatRooms');
    const userChatRoomRef = ref(db, `users/${currentUser.uid}/currentChatRoom`);
    const partnerChatRoomRef = ref(db, `users/${partnerUid}/currentChatRoom`);

    let existingChatRoom = null;

    // Check for an existing chat room
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
        // Use existing chat room
        currentChatRoom = existingChatRoom;
        await set(userChatRoomRef, currentChatRoom);
        await set(partnerChatRoomRef, currentChatRoom);
    } else {
        // Create a new chat room
        const newChatRoomRef = push(chatRoomsRef);
        currentChatRoom = newChatRoomRef.key;
        await set(newChatRoomRef, {
            users: [currentUser.uid, partnerUid],
            messages: []
        });
        await set(userChatRoomRef, currentChatRoom);
        await set(partnerChatRoomRef, currentChatRoom);
    }

    updateUserStatus('busy'); // Update user status
    await set(ref(db, `activeUsers/${partnerUid}/status`), 'busy'); // Update partner's status
    console.log(`Connected to chat room with ID: ${currentChatRoom}`);
    redirectToChatRoom();     // Redirect to the chat room UI
    listenForMessages();      // Start listening for messages
    listenForTyping();        // Start listening for typing status
    resetInactivityTimer();   // Reset inactivity timer
}

// Redirect to Chat Room UI
function redirectToChatRoom() {
    alert("Successfully connected to a user! You can now start chatting.");
    document.getElementById('chat-container').style.display = 'block';
}

// Listen for Messages in the Chat Room
function listenForMessages() {
    if (!currentChatRoom) return;
    const chatMessagesRef = ref(db, `chatRooms/${currentChatRoom}/messages`);
    onValue(chatMessagesRef, (snapshot) => {
        const chatBox = document.getElementById('chat-box');
        chatBox.innerHTML = ''; // Clear existing messages
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
        chatBox.scrollTop = chatBox.scrollHeight; // Scroll to the latest message
    });
}

// Listen for Typing Status Updates
function listenForTyping() {
    if (!currentChatRoom) return;
    const typingRef = ref(db, `chatRooms/${currentChatRoom}/typing`);
    onValue(typingRef, (snapshot) => {
        const typingData = snapshot.val();
        const typingIndicator = document.getElementById('typing-indicator');

        if (typingData && typingData.uid !== currentUser.uid) {
            typingIndicator.textContent = "Stranger is typing...";
            clearTimeout(typingIndicatorTimeout); // Clear any previous timeout
            typingIndicatorTimeout = setTimeout(() => {
                typingIndicator.textContent = ""; // Hide indicator after 3 seconds of no activity
            }, 3000);
        } else {
            typingIndicator.textContent = ""; // Clear indicator if no typing data
        }
    });
}

// Handle Typing Status Updates
function handleTyping() {
    if (!currentChatRoom) return;

    const typingRef = ref(db, `chatRooms/${currentChatRoom}/typing`);
    // Update typing status in the database
    set(typingRef, {
        uid: currentUser.uid,
        timestamp: serverTimestamp()
    });

    // Clear typing status after 2 seconds of inactivity
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        remove(typingRef).catch((error) => {
            console.error("Error clearing typing status:", error);
        });
    }, 2000);
}

// Custom sensitive keywords for additional filtering
const customSensitiveWords = [
    "sext", "explicit", "rape", "suicide", "kill", "terror", "bomb", "attack", "war", 
    "politics", "mental harm", "abuse", "harass"
];

// Function to check for custom sensitive words
function containsSensitiveWords(input) {
    const lowercaseInput = input.toLowerCase();
    return customSensitiveWords.some(word => lowercaseInput.includes(word));
}

// Enhanced Send Message Function with Moderation and Custom Filtering
async function sendMessage() {
    const chatInput = document.getElementById('chat-input').value;
    if (chatInput.trim() === '') return; // Ignore empty messages

    try {
        // Custom filter check
        if (containsSensitiveWords(chatInput)) {
            alert("Your message contains sensitive or harmful content and cannot be sent.");
            document.getElementById('chat-input').value = ''; // Clear input field
            return;
        }

        // Call OpenAI API for moderation
        const response = await fetch('https://api.openai.com/v1/moderations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer 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` 
            },
            body: JSON.stringify({
                input: chatInput
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API returned an error: ${response.statusText}`);
        }

        const moderationResponse = await response.json();

        // Check if the message is flagged by OpenAI
        const flagged = moderationResponse.results.some(result => result.flagged);

        if (flagged) {
            alert("Your message contains inappropriate content and cannot be sent.");
            document.getElementById('chat-input').value = ''; // Clear input field
            return;
        }

        // Proceed if the message passes all checks
        const chatMessagesRef = ref(db, `chatRooms/${currentChatRoom}/messages`);
        const newMessageRef = push(chatMessagesRef);

        await set(newMessageRef, {
            uid: currentUser.uid,
            message: filterBadWords(formatMathExpression(chatInput)),
            replyTo: replyMessageId ? { message: replyMessageId } : null,
            timestamp: serverTimestamp()
        });

        document.getElementById('chat-input').value = ''; // Clear input field
        document.getElementById('chat-input').placeholder = 'You: Type a message...';
        replyMessageId = null; // Clear reply ID
        handleTyping(); // Reset typing status
        const chatBox = document.getElementById('chat-box');
        chatBox.scrollTop = chatBox.scrollHeight; // Scroll to the latest message

    } catch (error) {
        console.error("Error sending message or moderating content:", error);
    }
}


// Leave the Current Chat Room
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
            await remove(chatRoomRef); // Delete chat room data
            currentChatRoom = null;   // Reset chat room ID
            document.getElementById('chat-box').innerHTML = ''; // Clear chat UI
            document.getElementById('chat-container').style.display = 'none';
            alert("You have left the chat.");
            updateUserStatus('available'); // Mark user as available
        }, 500);
    }
}

// Format Math Expressions for Display
function formatMathExpression(input) {
    input = input.replace(/\^(\d+)/g, (_, exp) => `<sup>${exp}</sup>`);
    input = input.replace(/\*/g, '×');
    input = input.replace(/\//g, '÷');
    return input;
}

// Event Listeners for UI Elements
document.getElementById('new-chat-btn').addEventListener('click', startChat);
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('skip-btn').addEventListener('click', leaveChatRoom);
document.getElementById('chat-input').addEventListener('input', handleTyping);
document.getElementById('chat-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage(); // Send message on Enter key
    }
});

// Update Local Time on UI Every Second
setInterval(() => {
    document.getElementById('local-time').textContent = new Date().toLocaleTimeString();
}, 1000);
