// Import Firebase modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getDatabase, ref, onValue, remove, update } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDSU4RsY5zeQICARv6WUANKtgRoj17qhEo",
    authDomain: "edudb-4ce31.firebaseapp.com",
    databaseURL: "https://edudb-4ce31-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "edudb-4ce31",
    storageBucket: "edudb-4ce31.appspot.com",
    messagingSenderId: "5542930290",
    appId: "1:5542930290:web:c038e21d164b6b60779feb"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Admin credentials
const adminEmail = "admin@findaguest.online";
const adminPassword = "adminPassword123"; // Make sure to set this in the Firebase Console too!

// Function to load users
function loadUsers() {
    const usersRef = ref(db, 'users');
    onValue(usersRef, (snapshot) => {
        const users = snapshot.val();
        const tbody = document.querySelector('#users-table tbody');
        tbody.innerHTML = ''; // Clear table

        for (const userId in users) {
            const user = users[userId];
            const row = document.createElement('tr');

            row.innerHTML = `
                <td>${user.name}</td>
                <td>${user.username}</td>
                <td>${user.email}</td>
                <td>${user.role}</td>
                <td>${user.bio}</td>
                <td>
                    <button class="block" data-uid="${userId}">Block</button>
                    <button class="delete" data-uid="${userId}">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        }

        attachActionListeners();
    });
}

// Function to attach event listeners to buttons
function attachActionListeners() {
    document.querySelectorAll('.delete').forEach(button => {
        button.addEventListener('click', (e) => {
            const userId = e.target.getAttribute('data-uid');
            deleteUser(userId);
        });
    });

    document.querySelectorAll('.block').forEach(button => {
        button.addEventListener('click', (e) => {
            const userId = e.target.getAttribute('data-uid');
            blockUser(userId);
        });
    });
}

// Function to delete user
function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user?')) {
        remove(ref(db, `users/${userId}`))
            .then(() => alert('User deleted successfully'))
            .catch(error => alert('Error deleting user: ' + error.message));
    }
}

// Function to block user
function blockUser(userId) {
    if (confirm('Are you sure you want to block this user?')) {
        update(ref(db, `users/${userId}`), { role: 'blocked' })
            .then(() => alert('User blocked successfully'))
            .catch(error => alert('Error blocking user: ' + error.message));
    }
}

// Admin login logic
function adminLogin() {
    signInWithEmailAndPassword(auth, adminEmail, adminPassword)
        .then(() => {
            console.log("Admin logged in successfully");
            loadUsers(); // Proceed to load users after login
        })
        .catch((error) => {
            alert('Admin login failed: ' + error.message);
            window.location.href = "signpage.html"; // Redirect to login page if login fails
        });
}

// Check admin authentication
onAuthStateChanged(auth, (user) => {
    if (user) {
        if (user.email === adminEmail) {
            loadUsers(); // Only proceed if it's the admin
        } else {
            alert('Unauthorized access. Redirecting to login...');
            window.location.href = "signpage.html"; // Redirect to login page if unauthorized
        }
    } else {
        adminLogin(); 
    }
});
