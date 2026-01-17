// --- CONFIGURATION ---
const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = null;
let currentServerID = null;
let chatType = 'dm'; 

// 1. AUTH LOGIC
window.onload = async () => {
    const { data: { user } } = await _supabase.auth.getUser();
    if (user) {
        currentUser = user;
        document.getElementById('auth-overlay').style.display = 'none';
        
        const { data: prof } = await _supabase.from('profiles').select('*').eq('id', user.id).single();
        if (prof) updateLocalUI(prof.username, prof.pfp);
        
        setupRealtime();
        loadServers();
        setView('dm'); 
    }
};

async function handleAuth() {
    const email = document.getElementById('email-in').value;
    const password = document.getElementById('pass-in').value;
    const username = document.getElementById('username-in').value;

    // Simple toggle: Try login, if fail and username exists, try signup
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    
    if (error && username) {
        const { data: upData, error: upErr } = await _supabase.auth.signUp({ email, password });
        if (upErr) return alert(upErr.message);
        await _supabase.from('profiles').insert([{ id: upData.user.id, username, pfp: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}` }]);
        location.reload();
    } else if (error) {
        alert("Login failed. Provide a username to sign up.");
    } else {
        location.reload();
    }
}

// 2. NAVIGATION
async function setView(view, id = null) {
    currentServerID = id;
    const content = document.getElementById('sidebar-content');
    content.innerHTML = '';

    if (view === 'dm') {
        document.getElementById('sidebar-header').innerHTML = 'Direct Messages';
        loadDMs();
    } else {
        document.getElementById('sidebar-header').innerHTML = 'Channels';
        loadChannels(id);
        loadMembers(id);
    }
}

async function loadChannels(serverId) {
    const { data: channels } = await _supabase.from('channels').select('*').eq('server_id', serverId);
    const container = document.getElementById('sidebar-content');
    channels?.forEach(ch => {
        const div = document.createElement('div');
        div.className = 'aero-btn';
        div.style.margin = "5px";
        div.innerHTML = `# ${ch.name}`;
        div.onclick = () => {
            activeChatID = ch.id;
            chatType = 'server';
            document.getElementById('active-chat-name').innerText = `# ${ch.name}`;
            loadMessages();
        };
        container.appendChild(div);
    });
}

// 3. MESSAGING
async function loadMessages() {
    if (!activeChatID) return;
    const container = document.getElementById('chat-messages');
    
    let query = _supabase.from('messages').select('*').order('created_at', { ascending: true });
    if (chatType === 'server') query = query.eq('channel_id', activeChatID);
    else query = query.eq('chat_id', [currentUser.id, activeChatID].sort().join('_'));

    const { data } = await query;
    container.innerHTML = '';
    data?.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'message-bubble';
        div.innerHTML = `
            <img src="${msg.pfp_static}" class="avatar-circle" style="margin-right:10px">
            <div>
                <small><b>${msg.username_static}</b></small>
                <div>${msg.content}</div>
            </div>
        `;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('chat-in');
    if (!input.value.trim() || !activeChatID) return;

    const msg = {
        sender_id: currentUser.id,
        content: input.value,
        username_static: document.getElementById('my-name').textContent,
        pfp_static: document.getElementById('my-pfp').src,
        channel_id: chatType === 'server' ? activeChatID : null,
        chat_id: chatType === 'dm' ? [currentUser.id, activeChatID].sort().join('_') : null
    };

    input.value = '';
    await _supabase.from('messages').insert([msg]);
}

// 4. REALTIME & UTILS
function setupRealtime() {
    _supabase.channel('room1').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        loadMessages();
    }).subscribe();
}

function updateLocalUI(name, pfp) {
    document.getElementById('my-name').textContent = name;
    document.getElementById('my-pfp').src = pfp;
}

async function loadServers() {
    const { data } = await _supabase.from('server_members').select('servers(*)').eq('user_id', currentUser.id);
    const list = document.getElementById('server-list');
    data?.forEach(m => {
        const div = document.createElement('div');
        div.className = 'avatar-circle';
        div.style.background = "white";
        div.style.textAlign = "center";
        div.style.lineHeight = "40px";
        div.style.cursor = "pointer";
        div.innerText = m.servers.icon || '🌐';
        div.onclick = () => setView('server', m.servers.id);
        list.appendChild(div);
    });
}
