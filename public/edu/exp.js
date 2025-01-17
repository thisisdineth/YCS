import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase, ref, onValue, update, push, serverTimestamp, remove } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

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
const storage = getStorage(app);

let currentUserId = null;
let typingTimer;

const searchBar = document.getElementById('search-bar'); // Ensure searchBar is defined

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
    const newMessageCount = getNewMessageCount(userId);  // Ensure message count is calculated correctly
    const userElement = document.createElement('div');
    userElement.className = 'user-profile';
    userElement.innerHTML = `
        <img src="${userData.photoURL || 'img/default-avatar.png'}" alt="${userData.name}'s Profile Picture">
        <div class="user-info">
            <h3>${formatUserName(userData.name)}${newMessageCount > 0 ? ` <span class="new-msg">${newMessageCount} New</span>` : ''}</h3>
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
            <input type="file" id="file-input" accept="image/*">
            <button id="send-message-btn">Send</button>
            <button id="send-voice-btn">Record Voice</button>
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
    
    // Determine the type of message and format accordingly
    let messageContent;
    if (messageData.type === 'text') {
        messageContent = `<p>${messageData.content}</p>`;
    } else if (messageData.type === 'image') {
        messageContent = `<img src="${messageData.content}" alt="Image" class="message-image">`;
    } else if (messageData.type === 'voice') {
        messageContent = `<audio controls src="${messageData.content}">Your browser does not support the audio element.</audio>`;
    }

    messageElement.innerHTML = `
        ${messageContent}
        <div class="message-meta">
            <span class="time">${new Date(messageData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <span class="ticks ${messageData.seen ? 'read' : ''}">${messageData.senderId === currentUserId ? '✔✔' : ''}</span>
            <button class="reply-btn" data-message-content="${messageData.content}">Reply</button>
            <button class="delete-btn" data-message-id="${messageId}">Delete</button>
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
    const sendVoiceBtn = document.getElementById('send-voice-btn');
    const fileInput = document.getElementById('file-input');
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
    sendMessageBtn.addEventListener('click', async () => {
        const content = messageInput.value.trim();
        if (content === "") return; // Ignore empty messages
    
        try {
            // Custom filter for sexual, mental harm, and war-related content
            if (containsSensitiveContent(content)) {
                alert("Your message contains inappropriate content (sexual, harmful, or war-related) and cannot be sent.");
                messageInput.value = ''; // Clear input field
                return;
            }
    
            // Call OpenAI API for content moderation
            const response = await fetch('https://api.openai.com/v1/moderations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer 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`, 
                },
                body: JSON.stringify({ input: content }),
            });
    
            if (!response.ok) {
                throw new Error(`OpenAI API returned an error: ${response.statusText}`);
            }
    
            const moderationResponse = await response.json();
    
            // Check if the message is flagged by OpenAI
            const flagged = moderationResponse.results.some(result => result.flagged);
    
            if (flagged) {
                alert("Your message contains inappropriate content and cannot be sent.");
                messageInput.value = ''; // Clear input field
                return;
            }
    
            // Proceed with sending the message if it passes all checks
            const chatRef = ref(db, `chats/${getChatId(currentUserId, userId)}`);
            const newMessage = {
                content,
                senderId: currentUserId,
                timestamp: serverTimestamp(),
                seen: false,
                type: 'text' // Specify message type
            };
    
            await push(chatRef, newMessage);
            messageInput.value = ""; // Clear input field
    
            // Play send sound
            const sendSound = document.getElementById('send-sound');
            sendSound.play();
    
            // Update typing status
            updateTypingStatus(userId, false);
    
        } catch (error) {
            console.error("Error sending message or moderating content:", error);
        }
    });
    
    // Function to check for sensitive content like sexual, mental harm, or war-related terms
    function containsSensitiveContent(input) {
        const sensitiveWords = [
            'sex', 'rape', 'violence', 'abuse', 'war', 'kill', 'suicide', 'mental health', 'harassment', 'hate'
            // Add more harmful terms as needed
        ];
        const regex = new RegExp(`\\b(${sensitiveWords.join('|')})\\b`, 'i');
        return regex.test(input);
    }
    
    // Send voice message
    sendVoiceBtn.addEventListener('click', async () => {
        const audioBlob = await recordAudio();
        if (audioBlob) {
            const audioRef = storageRef(storage, `voiceMessages/${Date.now()}.wav`);
            await uploadBytes(audioRef, audioBlob);
            const audioURL = await getDownloadURL(audioRef);

            const chatRef = ref(db, `chats/${getChatId(currentUserId, userId)}`);
            const newMessage = {
                content: audioURL,
                senderId: currentUserId,
                timestamp: serverTimestamp(),
                seen: false,
                type: 'voice' // Specify type
            };

            await push(chatRef, newMessage);
            const sendSound = document.getElementById('send-sound');
            sendSound.play();
            updateTypingStatus(userId, false);
        }
    });

    // Upload image message
    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) {
            const imageRef = storageRef(storage, `images/${Date.now()}_${file.name}`);
            await uploadBytes(imageRef, file);
            const imageURL = await getDownloadURL(imageRef);

            const chatRef = ref(db, `chats/${getChatId(currentUserId, userId)}`);
            const newMessage = {
                content: imageURL,
                senderId: currentUserId,
                timestamp: serverTimestamp(),
                seen: false,
                type: 'image' // Specify type
            };

            await push(chatRef, newMessage);
            event.target.value = ""; // Clear input
        }
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

// Function to record audio
const recordAudio = () => {
    return new Promise((resolve, reject) => {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then((stream) => {
                const mediaRecorder = new MediaRecorder(stream);
                const audioChunks = [];

                mediaRecorder.start();

                const stopRecording = () => {
                    mediaRecorder.stop();
                    stream.getTracks().forEach(track => track.stop());
                };

                mediaRecorder.ondataavailable = (event) => {
                    audioChunks.push(event.data);
                };

                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    resolve(audioBlob);
                };

                // Stop recording after 5 seconds (adjust as needed)
                setTimeout(stopRecording, 5000);
            })
            .catch((error) => {
                console.error('Error accessing microphone:', error);
                reject(error);
            });
    });
};
