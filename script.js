const SB_URL = 'nrpiojdaltgfgswvhrys';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let isLoginMode = false;
let currentView = 'dm';
let activeChatID = null;

// --- AUTH ---
function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('signup-fields').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('auth-main-btn').innerText = isLoginMode ? 'Login' : 'Sign Up';
    document.getElementById('auth-toggle').innerText = isLoginMode ? "Need an account? Sign Up" : "Already have an account? Login";
}

async function handleAuth() {
    const email = document.getElementById('email-in').value;
    const password = document.getElementById('pass-in').value;

    if (isLoginMode) {
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) return alert(error.message);
        location.reload();
    } else {
        const username = document.getElementById('username-in').value;
        const { data, error } = await _supabase.auth.signUp({ email, password });
        if (error) return alert(error.message);
        
        // Create initial profile
        await _supabase.from('profiles').upsert([{ 
            id: data.user.id, 
            username, 
            pfp: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}` 
        }]);
        alert("Success! Please log in.");
        toggleAuthMode();
    }
}

// --- PROFILE CUSTOMIZATION ---
async function openProfileSettings() {
    const newName = prompt("New username:", document.getElementById('my-name').innerText);
    const newPfp = prompt("New PFP Image URL (Leave blank for default):");

    if (!newName) return;

    const { error } = await _supabase.from('profiles').upsert({
        id: currentUser.id,
        username: newName,
        pfp: newPfp || `https://api.dicebear.com/7.x/avataaars/svg?seed=${newName}`
    });

    if (!error) {
        document.getElementById('my-name').innerText = newName;
        if(newPfp) document.getElementById('my-pfp').src = newPfp;
    }
}

// --- MESSAGING ---
async function sendMessage() {
    const input = document.getElementById('chat-in');
    if (!input.value.trim() || !currentUser) return;

    await _supabase.from('messages').insert([{
        sender_id: currentUser.id,
        content: input.value,
        username_static: document.getElementById('my-name').innerText,
        pfp_static: document.getElementById('my-pfp').src
    }]);
    input.value = '';
}

async function loadMessages() {
    const { data } = await _supabase.from('messages').select('*').order('created_at', { ascending: true });
    const box = document.getElementById('chat-messages');
    box.innerHTML = '';
    data?.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'message-bubble';
        div.innerHTML = `
            <img src="${msg.pfp_static}" style="width:35px; height:35px; border-radius:8px;">
            <div>
                <div style="font-weight:bold; font-size:12px; color:#0078d7;">${msg.username_static}</div>
                <div style="font-size:14px;">${msg.content}</div>
            </div>
        `;
        box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
}

// --- INIT ---
window.onload = async () => {
    const { data: { user } } = await _supabase.auth.getUser();
    if (user) {
        currentUser = user;
        document.getElementById('auth-overlay').style.display = 'none';
        
        const { data: prof } = await _supabase.from('profiles').select('*').eq('id', user.id).single();
        if (prof) {
            document.getElementById('my-name').innerText = prof.username;
            document.getElementById('my-pfp').src = prof.pfp;
        } else {
            document.getElementById('my-name').innerText = user.email.split('@')[0];
        }

        loadMessages();
        _supabase.channel('public:messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, loadMessages).subscribe();
    }
};
