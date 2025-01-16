import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase, ref, set, get, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
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

// DOM Elements
const loader = document.getElementById('loader');
const messageContainer = document.getElementById('message');

// Function to show loader
function showLoader() {
    loader.style.display = 'block';
}

// Function to hide loader
function hideLoader() {
    loader.style.display = 'none';
}

// Function to show message
function showMessage(message, type = 'success') {
    messageContainer.textContent = message;
    messageContainer.className = `message-container ${type}`;
}

// Clear message after timeout
function clearMessage(timeout = 3000) {
    setTimeout(() => {
        messageContainer.textContent = '';
    }, timeout);
}

// Sign Up Function
document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    showLoader();
    const name = document.getElementById('signup-name').value;
    const username = document.getElementById('signup-username').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const role = document.querySelector('input[name="role"]:checked').value;
    const bio = document.getElementById('signup-bio').value;
    const photoFile = document.getElementById('signup-photo').files[0];

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        let photoURL = "";
        if (photoFile && photoFile.size <= 2 * 1024 * 1024) { // Check if file size is within 2MB
            const storagePath = `profilePictures/${user.uid}/${photoFile.name}`;
            const imageRef = storageRef(storage, storagePath);
            await uploadBytes(imageRef, photoFile);
            photoURL = await getDownloadURL(imageRef);
        }

        // Save user data in the database
        await set(ref(db, 'users/' + user.uid), {
            name: name,
            username: username,
            email: email,
            role: role,
            bio: bio,
            photoURL: photoURL
        });

        hideLoader();
        showMessage("Sign Up Successful!", "success");
        clearMessage();

        setTimeout(() => {
            window.location.href = "index.html"; // Redirect to the main page after sign-up
        }, 1000);
    } catch (error) {
        hideLoader();
        showMessage("Sign Up Error: " + error.message, "error");
        clearMessage();
    }
});

// Sign In Function
document.getElementById('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    showLoader();
    const usernameOrEmail = document.getElementById('signin-username').value;
    const password = document.getElementById('signin-password').value;

    try {
        // Check if input is an email or a username
        let signInMethod = signInWithEmailAndPassword(auth, usernameOrEmail, password);
        if (!usernameOrEmail.includes('@')) {
            // Treat input as a username
            const usersRef = query(ref(db, 'users'), orderByChild('username'), equalTo(usernameOrEmail));
            const snapshot = await get(usersRef);

            if (snapshot.exists()) {
                const userData = Object.values(snapshot.val())[0];
                signInMethod = signInWithEmailAndPassword(auth, userData.email, password);
            } else {
                throw new Error("Username not found");
            }
        }

        await signInMethod;
        hideLoader();
        showMessage("Sign In Successful!", "success");
        clearMessage();

        setTimeout(() => {
            window.location.href = "index.html"; // Redirect to the main page after sign-in
        }, 1000);
    } catch (error) {
        hideLoader();
        showMessage("Sign In Error: " + error.message, "error");
        clearMessage();
    }
});

// Auth State Change Listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("User is signed in:", user);
    } else {
        console.log("No user is signed in.");
    }
});

// Toggle between Sign Up and Sign In
document.addEventListener('DOMContentLoaded', () => {
    const switchBtn = document.getElementById('switch-btn');
    const signupContainer = document.getElementById('signup-container');
    const signinContainer = document.getElementById('signin-container');

    switchBtn.addEventListener('click', () => {
        if (signupContainer.style.display === 'none') {
            signupContainer.style.display = 'block';
            signinContainer.style.display = 'none';
            switchBtn.textContent = 'Already have an Account?';
        } else {
            signupContainer.style.display = 'none';
            signinContainer.style.display = 'block';
            switchBtn.textContent = 'Create an Account';
        }
    });
});
