import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase, ref, onValue, update, push, serverTimestamp, remove } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDSU4RsY5zeQICARv6WUANKtgRoj17qhEo",
    authDomain: "edudb-4ce31.firebaseapp.com",
    projectId: "edudb-4ce31",
    storageBucket: "edudb-4ce31.appspot.com",
    messagingSenderId: "5542930290",
    appId: "1:5542930290:web:c038e21d164b6b60779feb",
    databaseURL: "https://edudb-4ce31-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let currentUserId = null;
let typingTimer;

// Initialize listeners
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        updateOnlineStatus(true);
        window.addEventListener('beforeunload', () => updateOnlineStatus(false));
        loadUsers();
    } else {
        window.location.href = "signpage.html"; // Redirect if not logged in
    }
});

// Update online status
const updateOnlineStatus = async (isOnline) => {
    const userStatusRef = ref(db, `users/${currentUserId}`);
    await update(userStatusRef, {
        online: isOnline,
        lastOnline: serverTimestamp()
    });
};

// Load and display user profiles
const loadUsers = () => {
    onValue(ref(db, 'users'), (snapshot) => {
        const userListContainer = document.getElementById('user-list');
        userListContainer.innerHTML = "";
        snapshot.forEach((childSnapshot) => {
            const userData = childSnapshot.val();
            if (childSnapshot.key !== currentUserId) {
                const userElement = createUserElement(childSnapshot.key, userData);
                userListContainer.appendChild(userElement);
            }
        });
    });
};

// Create user element
const createUserElement = (userId, userData) => {
    const userElement = document.createElement('div');
    userElement.className = 'user-profile';
    userElement.innerHTML = `
        <img src="${userData.photoURL || 'img/default-avatar.png'}" alt="${userData.name}'s Profile Picture">
        <div class="user-info">
            <h3>${formatUserName(userData.name)}${getNewMessageCount(userId) > 0 ? ` <span class="new-msg">${getNewMessageCount(userId)} New</span>` : ''}</h3>
        </div>
    `;
    userElement.addEventListener('click', () => openChat(userId, userData));
    return userElement;
};

// Format the user's name to show only the first two parts
const formatUserName = (name) => {
    const nameParts = name.split(" ");
    return nameParts.slice(0, 2).join(" ");
};

// Get the number of new messages for a user
const getNewMessageCount = (userId) => {
    let newMessageCount = 0;
    const chatRef = ref(db, `chats/${getChatId(currentUserId, userId)}`);
    onValue(chatRef, (snapshot) => {
        snapshot.forEach((childSnapshot) => {
            if (!childSnapshot.val().seen && childSnapshot.val().senderId !== currentUserId) {
                newMessageCount++;
            }
        });
    });
    return newMessageCount;
};

// Open chat with selected user
const openChat = (userId, userData) => {
    const chatContainer = document.getElementById('chat-container');
    chatContainer.style.display = 'block';
    chatContainer.innerHTML = `
        <div class="chat-header">
            <h3>${userData.name}</h3>
            <span class="status">${userData.online ? 'Online' : `Last seen: ${new Date(userData.lastOnline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</span>
            <button class="block-btn" data-id="${userId}">${userData.blockedBy && userData.blockedBy[currentUserId] ? 'Unblock' : 'Block'}</button>
        </div>
        <div class="chat-messages" id="chat-messages"></div>
        <div class="typing-indicator" id="typing-indicator"></div>
        <div class="chat-input">
            <textarea id="message-input" placeholder="Type a message..."></textarea>
            <button id="send-message-btn">Send</button>
        </div>
    `;
    loadMessages(userId);
    setupChatListeners(userId, userData);
};

// Load chat messages
const loadMessages = (userId) => {
    const chatMessagesContainer = document.getElementById('chat-messages');
    const chatRef = ref(db, `chats/${getChatId(currentUserId, userId)}`);

    onValue(chatRef, (snapshot) => {
        chatMessagesContainer.innerHTML = "";
        snapshot.forEach((childSnapshot) => {
            const messageData = childSnapshot.val();
            const messageElement = createMessageElement(messageData, childSnapshot.key, userId);
            chatMessagesContainer.appendChild(messageElement);

            // Auto-scroll to the latest message
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

            // Play receive sound and mark message as seen
            if (messageData.senderId !== currentUserId && !messageData.seen) {
                const receiveSound = document.getElementById('receive-sound');
                receiveSound.play();
                update(ref(db, `chats/${getChatId(currentUserId, userId)}/${childSnapshot.key}`), {
                    seen: true
                });
            }
        });

        // Attach event listeners to the reply and delete buttons after they are rendered
        const replyButtons = chatMessagesContainer.querySelectorAll('.reply-btn');
        const deleteButtons = chatMessagesContainer.querySelectorAll('.delete-btn');

        replyButtons.forEach((button) => {
            button.addEventListener('click', () => replyToMessage(button.dataset.messageContent));
        });

        deleteButtons.forEach((button) => {
            button.addEventListener('click', () => deleteMessage(button.dataset.messageId, userId));
        });
    });
};

// Create chat message element
const createMessageElement = (messageData, messageId, userId) => {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${messageData.senderId === currentUserId ? 'sent' : 'received'}`;
    messageElement.innerHTML = `
        <p>${messageData.content}</p>
        <span class="time">${new Date(messageData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <span class="ticks ${messageData.seen ? 'read' : ''}">${messageData.senderId === currentUserId ? '✔✔' : ''}</span>
        <div class="options-container">
            <div class="options">
                <button class="reply-btn" data-message-content="${messageData.content}">Reply</button>
                <button class="delete-btn" data-message-id="${messageId}">Delete</button>
            </div>
        </div>
    `;
    return messageElement;
};

// Reply to message
const replyToMessage = (messageContent) => {
    const messageInput = document.getElementById('message-input');
    messageInput.value = `Replying to: ${messageContent}\n`;
    messageInput.focus();
};

// Delete message
const deleteMessage = (messageId, userId) => {
    const chatRef = ref(db, `chats/${getChatId(currentUserId, userId)}/${messageId}`);
    remove(chatRef);
};

// Setup chat listeners and functionalities
const setupChatListeners = (userId, userData) => {
    const messageInput = document.getElementById('message-input');
    const sendMessageBtn = document.getElementById('send-message-btn');
    const blockBtn = document.querySelector('.block-btn');
    const typingIndicator = document.getElementById('typing-indicator');

    // Detect typing
    messageInput.addEventListener('input', () => {
        clearTimeout(typingTimer);
        updateTypingStatus(userId, true);
        typingTimer = setTimeout(() => updateTypingStatus(userId, false), 2000);
    });

    // Listen for typing indicator from the other user
    const typingRef = ref(db, `users/${currentUserId}/typing`);
    onValue(typingRef, (snapshot) => {
        if (snapshot.exists() && snapshot.val()[userId]) {
            typingIndicator.textContent = "typing...";
            typingIndicator.style.display = 'block';
        } else {
            typingIndicator.textContent = "";
            typingIndicator.style.display = 'none';
        }
    });

    // Send message
    sendMessageBtn.addEventListener('click', async () => {
        const content = messageInput.value.trim();
        if (content === "") return;

        const chatRef = ref(db, `chats/${getChatId(currentUserId, userId)}`);
        const newMessage = {
            content,
            senderId: currentUserId,
            timestamp: serverTimestamp(),
            seen: false
        };

        await push(chatRef, newMessage);
        messageInput.value = ""; // Clear input
        const sendSound = document.getElementById('send-sound');
        sendSound.play();
        updateTypingStatus(userId, false);
    });

    // Block/Unblock user
    blockBtn.addEventListener('click', async () => {
        const isBlocked = userData.blockedBy && userData.blockedBy[currentUserId];
        const userRef = ref(db, `users/${userId}/blockedBy`);
        await update(userRef, { [currentUserId]: isBlocked ? null : true });
        blockBtn.textContent = isBlocked ? 'Block' : 'Unblock';
    });
};

// Update typing status
const updateTypingStatus = async (userId, isTyping) => {
    const typingStatusRef = ref(db, `users/${userId}/typing`);
    await update(typingStatusRef, { [currentUserId]: isTyping });
};

// Generate chat ID (combination of user IDs)
const getChatId = (userId1, userId2) => {
    return [userId1, userId2].sort().join('_');
};

// Search users
searchBar.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const userProfiles = document.querySelectorAll('.user-profile');
    userProfiles.forEach(profile => {
        const userName = profile.querySelector('.user-info h3').textContent.toLowerCase();
        profile.style.display = userName.includes(searchTerm) ? 'flex' : 'none';
    });
});
