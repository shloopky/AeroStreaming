const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = null;

// --- SOUND EFFECTS (Embedded Base64) ---
// Simple Pop Sound
const sfxPop = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU"); 
// Glassy Login Chime (Short version)
const sfxLogin = new Audio("data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWgAAAA0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAILKwAAAAAAP8NAAA//uQZAUAB1YACAAAAAAABAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAABAAABAAABAAABAAABAAABAAABAAABAAABAAABAAABAAABAAABAAABAAAB//uQZAsAB1YACAAAAAAABAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAABAAABAAABAAABAAABAAABAAABAAABAAABAAABAAABAAABAAABAAABAAAB"); 
// Note: Since real mp3 Base64 strings are huge, I am using a placeholder above. 
// Ideally, use a real file like 'assets/pop.mp3'.
// However, the function below 'playClick()' simulates the behavior.

function playClick() {
    // A quick generated beep context to ensure sound works without files
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
}

function playLoginSound() {
    // A "Glassy" chord simulation
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [400, 500, 600, 800].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.1 + (i*0.05));
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 2);
    });
}

// Attach sound to all buttons automatically
document.addEventListener('click', (e) => {
    if(e.target.tagName === 'BUTTON' || e.target.classList.contains('tab') || e.target.classList.contains('dock-icon')) {
        playClick();
    }
});

// --- MAIN LOGIC ---

window.onload = async () => {
    const { data: { user } } = await _supabase.auth.getUser();
    
    if (user) {
        currentUser = user;
        const prof = await loadMyProfile();
        
        // CHECK: Is the ID #0000?
        if (!prof || prof.id_tag === 0 || prof.id_tag === "0000") {
            // Keep Gatekeeper Open
            document.getElementById('auth-msg').textContent = "Complete your profile to enter.";
            document.getElementById('username-in').style.display = 'none'; // Only need name edit
            document.getElementById('gatekeeper').style.display = 'flex';
        } else {
            // Success Entry
            enterApp();
        }
    }
};

function enterApp() {
    playLoginSound(); // Play the glass sound!
    const gate = document.getElementById('gatekeeper');
    gate.style.opacity = '0';
    setTimeout(() => {
        gate.style.display = 'none';
        document.getElementById('app-root').style.display = 'grid';
    }, 800);
    
    setupRealtime();
    setView('dm');
}

async function handleAuth() {
    playClick();
    const email = document.getElementById('email-in').value;
    const password = document.getElementById('pass-in').value;
    const username = document.getElementById('username-in').value;

    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    
    if (error && username) {
        // SignUp
        const { data: su, error: se } = await _supabase.auth.signUp({ email, password });
        if (se) return alert(se.message);
        
        await _supabase.from('profiles').insert([{ 
            id: su.user.id, 
            username: username, 
            display_name: username, 
            id_tag: 0, // Forces setup later
            pfp: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`
        }]);
        alert("Verification email sent!");
    } else if (error) {
        alert(error.message);
    } else {
        location.reload();
    }
}

async function loadMyProfile() {
    const { data: prof } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (prof) {
        document.getElementById('my-display-name').textContent = prof.display_name;
        document.getElementById('my-full-id').textContent = `#${String(prof.id_tag).padStart(4, '0')}`;
        document.getElementById('my-pfp').src = prof.pfp;
        return prof;
    }
}

async function saveProfile() {
    const newName = document.getElementById('edit-display-name').value;
    const newPfp = document.getElementById('edit-pfp').value;
    
    // Assign real ID now
    const finalTag = Math.floor(1000 + Math.random() * 8999);

    const { error } = await _supabase.from('profiles').update({ 
        display_name: newName, 
        pfp: newPfp,
        id_tag: finalTag 
    }).eq('id', currentUser.id);

    if (!error) {
        location.reload();
    }
}

// --- VIEW & CHAT LOGIC ---

function setView(type) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (type === 'dm') {
        document.getElementById('tab-friends').classList.add('active');
        loadFriends();
    } else {
        document.getElementById('tab-groups').classList.add('active');
        document.getElementById('sidebar-content').innerHTML = '<div style="padding:20px; text-align:center; opacity:0.6;">Groups coming soon...</div>';
    }
}

async function loadFriends() {
    const { data } = await _supabase.from('friendships').select('*, profiles:receiver_id(*)').eq('status', 'accepted');
    const container = document.getElementById('sidebar-content');
    container.innerHTML = '';
    
    data?.forEach(f => {
        const div = document.createElement('div');
        div.className = 'user-tray'; // You can style this in CSS
        div.style.padding = '10px';
        div.style.cursor = 'pointer';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '10px';
        div.innerHTML = `<img src="${f.profiles.pfp}" style="width:40px;height:40px;border-radius:50%;"> <b>${f.profiles.display_name}</b>`;
        div.onclick = () => {
            activeChatID = f.id;
            document.getElementById('active-chat-title').textContent = f.profiles.display_name;
            loadMessages();
        };
        container.appendChild(div);
    });
}

async function sendMessage() {
    const input = document.getElementById('chat-in');
    if (!input.value.trim() || !activeChatID) return;

    await _supabase.from('messages').insert([{
        sender_id: currentUser.id,
        content: input.value,
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
    
    data?.forEach(m => {
        const div = document.createElement('div');
        div.className = (m.sender_id === currentUser.id) ? 'msg-bubble own' : 'msg-bubble';
        div.textContent = m.content;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

function setupRealtime() {
    _supabase.channel('public:messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => loadMessages()).subscribe();
}

async function logout() {
    await _supabase.auth.signOut();
    location.reload();
}

// Modal Helpers
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
