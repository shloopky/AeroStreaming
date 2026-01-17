const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = null;
let isSignupMode = false;
let messageSubscription = null;

// --- Sound Engine (Synthesized Aero Pops) ---
function playSound(type) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    if (type === 'pop') {
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
    } else {
        // "Chime" sound for login
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);
    }
    
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
}

// --- App Startup ---
window.onload = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        await loadMyProfile();
        enterApp();
    }
};

function enterApp() {
    playSound('login');
    const gate = document.getElementById('gatekeeper');
    gate.style.opacity = '0';
    setTimeout(() => {
        gate.style.display = 'none';
        document.getElementById('app-root').style.display = 'grid';
        setupRealtime(); 
        setView('dm');
    }, 500);
}

// --- Authentication Logic (Login/Signup Switch) ---
function toggleAuthMode() {
    playSound('pop');
    isSignupMode = !isSignupMode;
    
    const authTitle = document.getElementById('auth-title');
    const mainBtn = document.getElementById('main-auth-btn');
    const toggleText = document.getElementById('toggle-text');
    const signupFields = document.getElementById('signup-fields');
    const authStatus = document.getElementById('auth-status');

    if (isSignupMode) {
        authTitle.textContent = "New Registration";
        authStatus.textContent = "Create your digital identity.";
        mainBtn.textContent = "Initialize Account";
        toggleText.textContent = "Already have an account? Log In";
        signupFields.style.display = "block";
    } else {
        authTitle.textContent = "System Access";
        authStatus.textContent = "Identify yourself to connect.";
        mainBtn.textContent = "Log In";
        toggleText.textContent = "New user? Create Account";
        signupFields.style.display = "none";
    }
}

async function handleAuth() {
    playSound('pop');
    const email = document.getElementById('email-in').value;
    const password = document.getElementById('pass-in').value;
    
    if (!email || !password) return alert("Credentials required.");

    if (isSignupMode) {
        // --- SIGNUP PROCESS ---
        const username = document.getElementById('username-in').value;
        if (!username) return alert("Please choose a username.");
        
        const { data, error } = await _supabase.auth.signUp({ email, password });
        if (error) return alert(error.message);
        
        if (data.user) {
            // Create Profile in Database immediately
            await _supabase.from('profiles').insert([{
                id: data.user.id,
                username: username,
                display_name: username,
                id_tag: Math.floor(1000 + Math.random() * 9000),
                pfp: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`
            }]);
            alert("Registration successful! Check your email for a link, then Log In.");
            toggleAuthMode(); // Switch back to login view
        }
    } else {
        // --- LOGIN PROCESS ---
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) return alert("Access Denied: " + error.message);
        
        currentUser = data.user;
        await loadMyProfile();
        enterApp();
    }
}

// --- Realtime Messaging ---
function setupRealtime() {
    if (messageSubscription) _supabase.removeChannel(messageSubscription);

    messageSubscription = _supabase
        .channel('public:messages')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages' 
        }, (payload) => {
            if (payload.new.chat_id === activeChatID) {
                appendMsgUI(payload.new);
            }
        })
        .subscribe();
}

function appendMsgUI(msg) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = (msg.sender_id === currentUser.id) ? 'msg-bubble own' : 'msg-bubble';
    div.textContent = msg.content;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// --- Data & Sidebar ---
async function loadMyProfile() {
    const { data } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (data) {
        document.getElementById('my-display-name').textContent = data.display_name;
        document.getElementById('my-full-id').textContent = `#${data.id_tag}`;
        document.getElementById('my-pfp').src = data.pfp;
        return data;
    }
}

async function sendMessage() {
    const input = document.getElementById('chat-in');
    const txt = input.value.trim();
    if (!txt || !activeChatID) return;

    await _supabase.from('messages').insert([{
        sender_id: currentUser.id,
        content: txt,
        chat_id: activeChatID,
        username_static: document.getElementById('my-display-name').textContent
    }]);
    input.value = '';
}

async function loadMessages() {
    if (!activeChatID) return;
    const { data } = await _supabase.from('messages').select('*').eq('chat_id', activeChatID).order('created_at', {ascending: true});
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    data?.forEach(m => appendMsgUI(m));
}

function setView(type) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const activeBtn = type === 'dm' ? 'tab-friends' : 'tab-groups';
    document.getElementById(activeBtn).classList.add('active');
    
    if (type === 'dm') loadFriends();
}

async function loadFriends() {
    const { data } = await _supabase.from('friendships').select('*, profiles:receiver_id(*)').eq('status', 'accepted');
    const container = document.getElementById('sidebar-content');
    container.innerHTML = '';
    
    data?.forEach(f => {
        const div = document.createElement('div');
        div.className = 'user-tray'; 
        div.style.cssText = 'padding:10px; cursor:pointer; display:flex; align-items:center; gap:10px; border-bottom:1px solid rgba(255,255,255,0.2);';
        div.innerHTML = `<img src="${f.profiles.pfp}" style="width:35px;height:35px;border-radius:50%;"> <b>${f.profiles.display_name}</b>`;
        div.onclick = () => {
            activeChatID = f.id;
            document.getElementById('active-chat-title').textContent = f.profiles.display_name;
            loadMessages();
        };
        container.appendChild(div);
    });
}

function logout() {
    _supabase.auth.signOut();
    location.reload();
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
