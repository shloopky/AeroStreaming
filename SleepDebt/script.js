// --- CONFIGURATION ---
// Shloopky is the master admin by default
let authorizedStreamers = JSON.parse(localStorage.getItem('aero_streamers')) || ["Shloopky"];
let users = JSON.parse(localStorage.getItem('aero_users')) || {};
let currentUser = null;

function login() {
    const userField = document.getElementById('username-input');
    const passField = document.getElementById('password-input');
    const username = userField.value.trim();
    const password = passField.value;

    // LOGIN LOGIC
    // Check if it's the Shloopky master account or a signed-up user
    if (username === "Shloopky" && password === "your_password_here") {
        currentUser = "Shloopky";
    } else if (users[username] && users[username] === password) {
        currentUser = username;
    } else {
        alert("Invalid login!");
        return;
    }

    // FIX: Update the Header to show the Username
    const userDisplay = document.getElementById('user-display');
    if (userDisplay) {
        userDisplay.innerHTML = `Welcome, <strong>${currentUser}</strong>! 🫧`;
    }

    // Hide login UI and show the app
    document.getElementById('auth-container').style.display = "none";
    document.getElementById('stream-controls').style.display = "block";

    // Call permission check
    checkPermissions();
    addSystemMessage(`${currentUser} has logged in.`);
}

function checkPermissions() {
    const startBtn = document.getElementById('start-btn');
    const adminPanel = document.getElementById('admin-panel');

    // 1. Hide/Show Stream Button
    if (currentUser && authorizedStreamers.includes(currentUser)) {
        startBtn.style.display = "inline-block";
        startBtn.disabled = false;
        startBtn.innerText = "Start Recording Screen";
    } else {
        startBtn.style.display = "none"; // Hide completely for non-authorized users
    }

    // 2. Show Admin Panel ONLY for Shloopky
    if (currentUser === "Shloopky") {
        if (adminPanel) adminPanel.style.display = "block";
    }
}

// Ensure the button is hidden by default when the page loads
window.onload = function() {
    document.getElementById('start-btn').style.display = "none";
};