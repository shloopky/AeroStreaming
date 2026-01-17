const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = null;
let isSignupMode = false;

// Sounds
const sfxClick = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU");
const sfxLogin = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU"); // Placeholder pop

function playSound() {
    // Basic beep simulation for feedback
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
}

// 1. INITIALIZATION
window.onload = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        const prof = await loadMyProfile();
        // If profile is incomplete (ID 0000), keep gatekeeper open but hide login inputs
        if (!prof || prof.id_tag === 0 || prof.id_tag === "0000") {
             document.getElementById('auth-status').textContent = "Profile Setup Required.";
             // We could show a profile setup UI here, but for now let's just let them in to edit
             enterApp(); 
        } else {
             enterApp();
        }
    }
};

function enterApp() {
    playSound();
    const gate = document.getElementById('gatekeeper');
    gate.style.opacity = '0';
    setTimeout(() => {
        gate.style.display = 'none';
        document.getElementById('app-root').style.display = 'grid';
        setView('dm');
    }, 500);
}

// 2. AUTHENTICATION LOGIC
function toggleMode() {
    isSignupMode = !isSignupMode;
    const btn = document.getElementById('main-auth-btn');
    const toggle = document.getElementById('toggle-text');
    const userField = document.getElementById('signup-section');
    
    if (isSignupMode) {
        btn.textContent = "Create Account";
        toggle.textContent = "Already have an account? Log In";
        userField.style.display = 'block';
    } else {
        btn.textContent = "Log In";
        toggle.textContent = "New user? Create Account";
        userField.style.display = 'none';
    }
}

async function handleAuth() {
    playSound();
    const email = document.getElementById('email-in').value;
    const password = document.getElementById('pass-in').value;
    
    if (!email || !password) return alert("Please fill in all fields.");

    if (isSignupMode) {
        // --- SIGN UP FLOW ---
        const username = document.getElementById('username-in').value;
        if (!username) return alert("Username is required for new accounts.");
        
        const { data, error } = await _supabase.auth.signUp({ email, password });
        if (error) return alert(error.message);
        
        // create profile row
        if (data.user) {
            await _supabase.from('profiles').insert([{
                id: data.user.id,
                username: username,
                display_name: username,
                id_tag: Math.floor(1000 + Math.random() * 9000), // Give them a real ID immediately
                pfp: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`
            }]);
            alert("Account created! Please check your email to verify, then log in.");
            toggleMode(); // Switch back to login mode
        }
    } else {
        // --- LOG IN FLOW ---
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) return alert("Login Failed: " + error.message);
        
        currentUser = data.user;
        await loadMyProfile();
        enterApp();
    }
}

async function logout() {
    await _supabase.auth.signOut();
    location.reload();
}

// 3. APP DATA LOGIC
async function loadMyProfile() {
    const { data } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (data) {
        document.getElementById('my-display-name').textContent = data.display_name;
        document.getElementById('my-full-id').textContent = `#${data.id_tag}`;
        document.getElementById('my-pfp').src = data.pfp;
        return data;
    }
}

function setView(type) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(type === 'dm' ? 'tab-friends' : 'tab-groups').classList.add('active');
    
    const container = document.getElementById('sidebar-content');
    if (type === 'dm') {
        loadFriends();
    } else {
        container.innerHTML = '<div style="padding:20px; text-align:center; opacity:0.6;">Groups feature connecting...</div>';
    }
}

async function loadFriends() {
    const { data } = await _supabase.from('friendships').select('*, profiles:receiver_id(*)').eq('status', 'accepted');
    const container = document.getElementById('sidebar-content');
    container.innerHTML = '';
    
    if (!data || data.length === 0) {
        container.innerHTML = '<div style="padding:20px; opacity:0.5; text-align:center;">No friends yet.<br>Click "+" to add.</div>';
        return;
    }

    data.forEach(f => {
        const div = document.createElement('div');
        div.className = 'user-tray'; 
        div.style.cssText = 'padding:10px; cursor:pointer; display:flex; align-items:center; gap:10px; border-bottom:1px solid rgba(0,0,0,0.05);';
        div.innerHTML = `<img src="${f.profiles.pfp}" style="width:35px;height:35px;border-radius:50%;"> <b>${f.profiles.display_name}</b>`;
        div.onclick = () => {
            activeChatID = f.id; // Using friendship ID as chat room
            document.getElementById('active-chat-title').textContent = f.profiles.display_name;
            loadMessages();
        };
        container.appendChild(div);
    });
}

async function sendMessage() {
    const input = document.getElementById('chat-in');
    const txt = input.value.trim();
    if (!txt || !activeChatID) return;

    // Optimistic UI update (shows message before server confirms)
    const container = document.getElementById('chat-messages');
    const tempDiv = document.createElement('div');
    tempDiv.className = 'msg-bubble own';
    tempDiv.textContent = txt;
    container.appendChild(tempDiv);
    container.scrollTop = container.scrollHeight;

    await _supabase.from('messages').insert([{
        sender_id: currentUser.id,
        content: txt,
        chat_id: activeChatID,
        username_static: document.getElementById('my-display-name').textContent
    }]);
    input.value = '';
}

async function loadMessages() {
    const { data } = await _supabase.from('messages').select('*').eq('chat_id', activeChatID).order('created_at', {ascending: true});
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    data?.forEach(m => {
        const div = document.createElement('div');
        div.className = (m.sender_id === currentUser.id) ? 'msg-bubble own' : 'msg-bubble';
        div.textContent = m.content;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

// Helpers
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
async function saveProfile() {
    const name = document.getElementById('edit-display-name').value;
    const pfp = document.getElementById('edit-pfp').value;
    if(name) await _supabase.from('profiles').update({ display_name: name, pfp: pfp }).eq('id', currentUser.id);
    closeModal('profile-modal');
    loadMyProfile();
}
