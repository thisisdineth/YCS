// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"; // Import initializeApp
import { getDatabase, ref, onValue, remove } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// Firebase Configuration
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);  // Initialize Firebase with the config

// Get Database reference
const db = getDatabase(app);  // Pass the initialized app to get the database

// Elements
const activeUsersCountElement = document.getElementById("active-users-count");
const activeChatRoomsCountElement = document.getElementById("active-chat-rooms-count");
const closeChatRoomBtn = document.getElementById("close-chat-room-btn");
const chatRoomsList = document.getElementById("chat-rooms-list");

// Function to update Active Users count
const updateActiveUsersCount = (snapshot) => {
    const activeUsers = snapshot.exists() ? snapshot.val() : {};
    activeUsersCountElement.textContent = `Active Users: ${Object.keys(activeUsers).length}`;
};

// Function to update Active Chat Rooms count and list
const updateChatRoomsCountAndList = (snapshot) => {
    const chatRooms = snapshot.exists() ? snapshot.val() : {};
    activeChatRoomsCountElement.textContent = `Active Chat Rooms: ${Object.keys(chatRooms).length}`;

    // Populate chat rooms dropdown
    chatRoomsList.innerHTML = '<option value="">Select a Chat Room</option>'; // Reset dropdown

    // Check if chatRooms is not empty
    if (Object.keys(chatRooms).length > 0) {
        for (const roomId in chatRooms) {
            const option = document.createElement('option');
            option.value = roomId;
            option.textContent = `Chat Room ID: ${roomId}`;
            chatRoomsList.appendChild(option);
        }
    } else {
        const noRoomsOption = document.createElement('option');
        noRoomsOption.value = "";
        noRoomsOption.textContent = "No active chat rooms.";
        chatRoomsList.appendChild(noRoomsOption);
    }
};

// Listen for Active Users
const activeUsersRef = ref(db, 'activeUsers');
onValue(activeUsersRef, (snapshot) => {
    updateActiveUsersCount(snapshot);
});

// Listen for Active Chat Rooms
const chatRoomsRef = ref(db, 'chatRooms');
onValue(chatRoomsRef, (snapshot) => {
    updateChatRoomsCountAndList(snapshot);
});

// Close selected chat room
closeChatRoomBtn.addEventListener("click", async () => {
    const selectedRoomId = chatRoomsList.value;
    if (!selectedRoomId) {
        alert("Please select a chat room to close.");
        return;
    }

    const chatRoomRef = ref(db, `chatRooms/${selectedRoomId}`);
    try {
        await remove(chatRoomRef);
        alert(`Chat Room ${selectedRoomId} has been closed.`);
    } catch (error) {
        console.error("Error closing chat room:", error);
        alert("Failed to close the chat room.");
    }
});
