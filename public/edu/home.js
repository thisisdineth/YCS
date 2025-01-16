// home.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase, ref, push, onValue, remove, update, get } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

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

// DOM Elements
const tweetForm = document.getElementById('new-tweet');
const postTweetBtn = document.getElementById('post-tweet-btn');
const tweetsContainer = document.getElementById('tweets-container');
const signoutBtn = document.getElementById('signout-btn');

// Constants
const TWEET_CHAR_LIMIT = 280;
const REPLY_CHAR_LIMIT = 140;

// Helper Functions

/**
 * Creates and returns a loading spinner element.
 * @returns {HTMLElement} Spinner element.
 */
const createSpinner = () => {
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.innerHTML = `
        <div class="double-bounce1"></div>
        <div class="double-bounce2"></div>
    `;
    return spinner;
};

/**
 * Displays an error message to the user.
 * @param {string} message - The error message to display.
 */
const showError = (message) => {
    alert(message); // Simple alert. For better UX, consider creating a dedicated error message UI element.
};

/**
 * Truncates a string to the specified length and adds ellipsis if necessary.
 * @param {string} str - The string to truncate.
 * @param {number} maxLength - Maximum allowed length.
 * @returns {string} Truncated string.
 */
const truncate = (str, maxLength) => {
    return str.length > maxLength ? str.substring(0, maxLength - 3) + '...' : str;
};

// Event Listeners

// Custom sensitive keywords for additional filtering
const customSensitiveWords = [
    "war", "politics", "sex", "harassment", "suicide", "rape", "abuse", "terror", "kill",
    "attack", "mental harm", "explicit", "bomb", "violence", "discrimination" , "bad words" , "nudity" ,"crimes" 
];

// Function to check for custom sensitive words
function containsSensitiveWords(input) {
    const lowercaseInput = input.toLowerCase();
    return customSensitiveWords.some(word => lowercaseInput.includes(word));
}

// Event Listener: Post a new tweet with moderation checks
postTweetBtn.addEventListener('click', async () => {
    const tweetContent = tweetForm.value.trim();

    // Form Validation
    if (tweetContent === "") {
        showError("Tweet cannot be empty!");
        return;
    }
    if (tweetContent.length > TWEET_CHAR_LIMIT) {
        showError(`Tweet cannot exceed ${TWEET_CHAR_LIMIT} characters.`);
        return;
    }

    // Check for custom sensitive words
    if (containsSensitiveWords(tweetContent)) {
        showError("Your tweet contains inappropriate content and cannot be posted.");
        return;
    }

    // Call OpenAI Moderation API for additional filtering
    try {
        const response = await fetch('https://api.openai.com/v1/moderations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer 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` 
            },
            body: JSON.stringify({
                input: tweetContent
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API returned an error: ${response.statusText}`);
        }

        const moderationResponse = await response.json();

        // Check if the tweet is flagged by OpenAI
        const flagged = moderationResponse.results.some(result => result.flagged);

        if (flagged) {
            showError("Your tweet contains harmful or inappropriate content and cannot be posted.");
            return;
        }

        // Proceed to post the tweet if it passes all checks
        const user = auth.currentUser;

        if (user) {
            try {
                // Show loading spinner
                postTweetBtn.disabled = true;
                postTweetBtn.innerText = 'Posting...';

                const userRef = ref(db, `users/${user.uid}`);
                const userSnapshot = await get(userRef);
                const userData = userSnapshot.val();

                if (!userData) {
                    throw new Error("User data not found.");
                }

                const tweetRef = ref(db, 'tweets/');
                const newTweet = {
                    content: tweetContent,
                    author: `${userData.name} (${userData.role})`,
                    username: userData.username,
                    photoURL: userData.photoURL || "default-profile.png",
                    bio: userData.bio || "",
                    userId: user.uid,
                    timestamp: new Date().toISOString(),
                    likes: 0,
                    likedBy: [] // Array to store user IDs who liked the tweet
                };

                await push(tweetRef, newTweet);
                tweetForm.value = ""; // Clear the input field after posting
            } catch (error) {
                console.error("Error posting tweet:", error);
                showError("Failed to post tweet. Please try again.");
            } finally {
                // Hide loading spinner
                postTweetBtn.disabled = false;
                postTweetBtn.innerText = 'Post';
            }
        } else {
            showError("You must be logged in to post a tweet!");
        }
    } catch (error) {
        console.error("Error moderating content:", error);
        showError("Failed to analyze tweet content. Please try again.");
    }
});


// Load tweets in real-time
const loadTweets = () => {
    // Show loading spinner
    tweetsContainer.innerHTML = "";
    const spinner = createSpinner();
    tweetsContainer.appendChild(spinner);

    onValue(ref(db, 'tweets/'), async (snapshot) => {
        tweetsContainer.innerHTML = ""; // Clear previous tweets
        const tweets = [];

        snapshot.forEach((childSnapshot) => {
            const tweetData = childSnapshot.val();
            const tweetId = childSnapshot.key;
            tweets.push({ id: tweetId, data: tweetData });
        });

        if (tweets.length > 0) {
            // Sort tweets by timestamp to get the latest tweet first
            tweets.sort((a, b) => new Date(b.data.timestamp) - new Date(a.data.timestamp));

            // Extract the most recent tweet
            const latestTweet = tweets.shift();

            // Shuffle the remaining tweets
            const shuffledTweets = tweets.sort(() => Math.random() - 0.5);

            // Render the most recent tweet first
            renderTweet(latestTweet.id, latestTweet.data);

            // Render the shuffled tweets
            shuffledTweets.forEach(tweet => renderTweet(tweet.id, tweet.data));
        } else {
            tweetsContainer.innerHTML = "<p>No tweets available.</p>";
        }
    }, (error) => {
        console.error("Error loading tweets:", error);
        tweetsContainer.innerHTML = "<p>Error loading tweets. Please try again later.</p>";
    });
};

// Function to render a tweet
const renderTweet = (tweetId, tweetData) => {
    const tweetElement = document.createElement('div');
    tweetElement.className = 'tweet';
    tweetElement.innerHTML = `
        <div class="tweet-header">
            <img src="${tweetData.photoURL}" alt="${tweetData.author}'s Profile Picture" class="profile-pic">
            <h3 class="fullname">${truncate(tweetData.author, 25)}</h3>
            ${tweetData.bio ? `<div class="bio-tooltip">${truncate(tweetData.bio, 50)}</div>` : ''}
        </div>
        <p>${truncate(tweetData.content, 280)}</p>
        <small>Posted by ${truncate(tweetData.author, 25)} at ${new Date(tweetData.timestamp).toLocaleString()}</small>
        <div class="actions">
            <button class="reply-btn" data-id="${tweetId}" data-author="${tweetData.author}">Reply</button>
            ${tweetData.userId === auth.currentUser?.uid ? `<button class="delete-btn" data-id="${tweetId}">Delete</button>` : ''}
            <button class="like-btn" data-id="${tweetId}" data-liked-by="${tweetData.likedBy?.includes(auth.currentUser?.uid) ? 'true' : 'false'}">
                <i class="fa fa-thumbs-up"></i> Like <span class="like-count">${tweetData.likes}</span>
            </button>
            <button class="load-replies-btn" data-id="${tweetId}">Show Replies (${tweetData.replyCount || 0})</button>
        </div>
        <div class="reply-box" style="display: none;">
            <textarea class="reply-input" placeholder="Write a reply..." maxlength="${REPLY_CHAR_LIMIT}" rows="2"></textarea>
            <button class="submit-reply-btn" data-id="${tweetId}">Submit Reply</button>
        </div>
        <div class="replies-container" id="replies-${tweetId}" style="display: none;"></div>
    `;

    tweetsContainer.appendChild(tweetElement);

    // Add event listeners for the buttons
    addTweetEventListeners(tweetElement, tweetId);
};

// Add event listeners for each tweet
const addTweetEventListeners = (tweetElement, tweetId) => {
    // Delete button
    const deleteBtn = tweetElement.querySelector('.delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (confirm("Are you sure you want to delete this tweet?")) {
                try {
                    await remove(ref(db, 'tweets/' + tweetId));
                    await remove(ref(db, 'replies/' + tweetId));
                } catch (error) {
                    console.error("Error deleting tweet:", error);
                    showError("Failed to delete tweet. Please try again.");
                }
            }
        });
    }

    // Like button
    const likeBtn = tweetElement.querySelector('.like-btn');
    if (likeBtn) {
        likeBtn.addEventListener('click', async () => {
            const tweetRef = ref(db, 'tweets/' + tweetId);
            try {
                const tweetSnapshot = await get(tweetRef);
                const tweetData = tweetSnapshot.val();

                if (tweetData) {
                    const likedBy = tweetData.likedBy || [];
                    const userId = auth.currentUser.uid;

                    let newLikes;
                    if (likedBy.includes(userId)) {
                        newLikes = tweetData.likes - 1;
                        const index = likedBy.indexOf(userId);
                        if (index > -1) likedBy.splice(index, 1);
                    } else {
                        newLikes = tweetData.likes + 1;
                        likedBy.push(userId);
                    }

                    await update(tweetRef, { likes: newLikes, likedBy: likedBy });

                    likeBtn.dataset.likedBy = likedBy.includes(userId) ? 'true' : 'false';
                    likeBtn.querySelector('.like-count').innerText = newLikes;
                }
            } catch (error) {
                console.error("Error liking tweet:", error);
                showError("Failed to like tweet. Please try again.");
            }
        });
    }

    // Load Replies button
    const loadRepliesBtn = tweetElement.querySelector('.load-replies-btn');
    if (loadRepliesBtn) {
        loadRepliesBtn.addEventListener('click', async () => {
            const repliesContainer = document.getElementById(`replies-${tweetId}`);
            const isVisible = repliesContainer.style.display === 'block';
            const newVisibility = isVisible ? 'none' : 'block';
            repliesContainer.style.display = newVisibility;

            // Toggle button text
            loadRepliesBtn.innerText = isVisible ? `Show Replies (${loadRepliesBtn.dataset.replyCount || 0})` : `Hide Replies (${loadRepliesBtn.dataset.replyCount || 0})`;

            if (!isVisible) {
                await loadReplies(tweetId, repliesContainer, loadRepliesBtn);
            }
        });
    }

    // Reply button
    const replyBtn = tweetElement.querySelector('.reply-btn');
    if (replyBtn) {
        replyBtn.addEventListener('click', () => {
            const replyBox = tweetElement.querySelector('.reply-box');
            replyBox.style.display = replyBox.style.display === 'none' ? 'block' : 'none';
        });
    }

    // Submit Reply button
    const submitReplyBtn = tweetElement.querySelector('.submit-reply-btn');
    if (submitReplyBtn) {
        submitReplyBtn.addEventListener('click', async () => {
            const replyInput = tweetElement.querySelector('.reply-input');
            const replyContent = replyInput.value.trim();

            // Form Validation
            if (replyContent === "") {
                showError("Reply cannot be empty!");
                return;
            }
            if (replyContent.length > REPLY_CHAR_LIMIT) {
                showError(`Reply cannot exceed ${REPLY_CHAR_LIMIT} characters.`);
                return;
            }

            const user = auth.currentUser;
            if (user) {
                try {
                    // Show loading indicator
                    submitReplyBtn.disabled = true;
                    submitReplyBtn.innerText = 'Submitting...';

                    const userRef = ref(db, `users/${user.uid}`);
                    const userSnapshot = await get(userRef);
                    const userData = userSnapshot.val();

                    if (!userData) {
                        throw new Error("User data not found.");
                    }

                    const replyRef = ref(db, `replies/${tweetId}`);
                    const newReply = {
                        content: replyContent,
                        author: `${userData.name} (${userData.role})`,
                        username: userData.username,
                        photoURL: userData.photoURL || "img/default-avatar.png",
                        bio: userData.bio || "",
                        userId: user.uid,
                        timestamp: new Date().toISOString(),
                        likes: 0,
                        likedBy: []  // Array to store user IDs who liked the reply
                    };

                    await push(replyRef, newReply);
                    replyInput.value = ""; // Clear reply input after submitting
                    await updateReplyCount(tweetId); // Update reply count

                    // If replies are visible, reload them to include the new reply
                    const repliesContainer = document.getElementById(`replies-${tweetId}`);
                    if (repliesContainer.style.display === 'block') {
                        await loadReplies(tweetId, repliesContainer, loadRepliesBtn);
                    }
                } catch (error) {
                    console.error("Error submitting reply:", error);
                    showError("Failed to submit reply. Please try again.");
                } finally {
                    // Hide loading indicator
                    submitReplyBtn.disabled = false;
                    submitReplyBtn.innerText = 'Submit Reply';
                }
            } else {
                showError("You must be logged in to reply!");
            }
        });
    }
};

// Function to load replies for a specific tweet
const loadReplies = async (tweetId, container, loadRepliesBtn) => {
    // Clear existing content and show loading spinner
    container.innerHTML = "";
    const spinner = createSpinner();
    container.appendChild(spinner);

    try {
        const repliesSnapshot = await get(ref(db, `replies/${tweetId}`));
        container.innerHTML = ""; // Clear spinner

        if (repliesSnapshot.exists()) {
            const replies = [];
            repliesSnapshot.forEach((childSnapshot) => {
                const replyData = childSnapshot.val();
                const replyId = childSnapshot.key;
                replies.push({ id: replyId, data: replyData });
            });

            // Sort replies by timestamp (oldest first)
            replies.sort((a, b) => new Date(a.data.timestamp) - new Date(b.data.timestamp));

            replies.forEach(reply => renderReply(reply.id, reply.data, tweetId, container));

            // Update Load Replies button text
            loadRepliesBtn.innerText = `Hide Replies (${replies.length})`;
            loadRepliesBtn.dataset.replyCount = replies.length;
        } else {
            container.innerHTML = "<p>No replies yet.</p>";
            loadRepliesBtn.innerText = `Hide Replies (0)`;
            loadRepliesBtn.dataset.replyCount = 0;
        }
    } catch (error) {
        console.error("Error loading replies:", error);
        container.innerHTML = "<p>Error loading replies. Please try again later.</p>";
    }
};

// Function to render a reply
const renderReply = (replyId, replyData, tweetId, container) => {
    const replyElement = document.createElement('div');
    replyElement.className = 'reply';
    replyElement.innerHTML = `
        <div class="reply-header">
            <img src="${replyData.photoURL}" alt="${replyData.author}'s Profile Picture" class="profile-pic">
            <h4 class="fullname">${truncate(replyData.author, 25)}</h4>
            ${replyData.bio ? `<div class="bio-tooltip">${truncate(replyData.bio, 50)}</div>` : ''}
        </div>
        <p>${truncate(replyData.content, 140)}</p>
        <small>Posted by ${truncate(replyData.author, 25)} at ${new Date(replyData.timestamp).toLocaleString()}</small>
        <div class="actions">
            <button class="like-btn" data-id="${replyId}" data-tweet-id="${tweetId}" data-liked-by="${replyData.likedBy?.includes(auth.currentUser?.uid) ? 'true' : 'false'}">
                <i class="fa fa-thumbs-up"></i> Like <span class="like-count">${replyData.likes}</span>
            </button>
            ${replyData.userId === auth.currentUser?.uid ? `<button class="delete-reply-btn" data-id="${replyId}" data-tweet-id="${tweetId}">Delete</button>` : ''}
        </div>
    `;

    container.appendChild(replyElement);

    // Add event listeners for the reply buttons
    addReplyEventListeners(replyElement, tweetId, replyId);
};

// Add event listeners for each reply
const addReplyEventListeners = (replyElement, tweetId, replyId) => {
    // Delete Reply button
    const deleteReplyBtn = replyElement.querySelector('.delete-reply-btn');
    if (deleteReplyBtn) {
        deleteReplyBtn.addEventListener('click', async () => {
            if (confirm("Are you sure you want to delete this reply?")) {
                try {
                    await remove(ref(db, `replies/${tweetId}/${replyId}`));
                    await updateReplyCount(tweetId); // Update reply count
                } catch (error) {
                    console.error("Error deleting reply:", error);
                    showError("Failed to delete reply. Please try again.");
                }
            }
        });
    }

    // Like Reply button
    const likeReplyBtn = replyElement.querySelector('.like-btn');
    if (likeReplyBtn) {
        likeReplyBtn.addEventListener('click', async () => {
            const replyRef = ref(db, `replies/${tweetId}/${replyId}`);
            try {
                const replySnapshot = await get(replyRef);
                const replyData = replySnapshot.val();

                if (replyData) {
                    const likedBy = replyData.likedBy || [];
                    const userId = auth.currentUser.uid;

                    let newLikes;
                    if (likedBy.includes(userId)) {
                        newLikes = replyData.likes - 1;
                        const index = likedBy.indexOf(userId);
                        if (index > -1) likedBy.splice(index, 1);
                    } else {
                        newLikes = replyData.likes + 1;
                        likedBy.push(userId);
                    }

                    await update(replyRef, { likes: newLikes, likedBy: likedBy });

                    likeReplyBtn.dataset.likedBy = likedBy.includes(userId) ? 'true' : 'false';
                    likeReplyBtn.querySelector('.like-count').innerText = newLikes;
                }
            } catch (error) {
                console.error("Error liking reply:", error);
                showError("Failed to like reply. Please try again.");
            }
        });
    }
};

// Function to update the reply count for a tweet
const updateReplyCount = async (tweetId) => {
    try {
        const repliesSnapshot = await get(ref(db, `replies/${tweetId}`));
        const replyCount = repliesSnapshot.exists() ? repliesSnapshot.size : 0;

        // Update the Load Replies button text
        const loadRepliesBtn = document.querySelector(`.load-replies-btn[data-id="${tweetId}"]`);
        if (loadRepliesBtn) {
            loadRepliesBtn.innerText = loadRepliesBtn.innerText.includes('Hide') ? `Hide Replies (${replyCount})` : `Show Replies (${replyCount})`;
            loadRepliesBtn.dataset.replyCount = replyCount;
        }
    } catch (error) {
        console.error("Error updating reply count:", error);
        // Optional: Show error message to user
    }
};

// Sign out functionality
signoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = "signpage.html";
    } catch (error) {
        console.error("Error signing out:", error);
        showError("Failed to sign out. Please try again.");
    }
});

// Ensure the user is authenticated
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "signpage.html";
    } else {
        loadTweets(); // Load tweets only if user is authenticated
    }
});
