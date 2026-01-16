/**
 * AeroSocial Pro v2.0
 * Features: Aero Glass Logic, DM/Server Routing, Friend Requests
 */

const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// Global App State
let currentUser = null;
let activeChatID = null;
let currentServerID = null;
let chatType = 'dm';
let lastProfileUpdate = null;
let isLoginMode = true; 

const PROFILE_COOLDOWN_MINUTES = 20;

// ────────────────────────────────────────────────
// 1. APP INITIALIZATION
// ────────────────────────────────────────────────

window.onload = async () => {
    const { data: { user } } = await _supabase.auth.getUser();

    if (user) {
        currentUser = user;
        document.getElementById('auth-overlay').style.display = 'none';

        const { data: prof } = await _supabase.from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (prof) {
            updateLocalUI(prof.username, prof.pfp);
        }

        setupRealtime();
        loadServers();
        setView('dm'); 
    } else {
        document.getElementById('auth-overlay').style.display = 'flex';
    }
};

function updateLocalUI(name, pfp) {
    document.getElementById('my-name').textContent = name;
    document.getElementById('my-pfp').src = pfp || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
}

// ────────────────────────────────────────────────
// 2. VIEW & NAVIGATION LOGIC
// ────────────────────────────────────────────────

function setView(view, id = null) {
    const content = document.getElementById('sidebar-content');
    const header = document.getElementById('sidebar-header');
    
    content.innerHTML = ''; 
    activeChatID = null;
    document.getElementById('chat-messages').innerHTML = '<div class="glass-panel" style="margin:20px; padding:10px; text-align:center;">Select a conversation to start chatting</div>';

    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));

    if (view === 'dm') {
        currentServerID = null;
        document.getElementById('nav-dm').classList.add('active');
        header.innerHTML = `Direct Messages`;
        loadDMList();
    } else if (view === 'friends') {
        currentServerID = null;
        document.getElementById('nav-friends').classList.add('active');
        header.innerText = "Friends Management";
        renderFriendsUI();
    } else if (view === 'server') {
        currentServerID = id;
        header.innerHTML = `<span>Channels</span> <span class="settings-gear" onclick="openServerSettings('${id}')">⚙️</span>`;
        document.querySelector(`.server-icon[data-server-id="${id}"]`)?.classList.add('active');
        loadChannels(id);
    }
}

// ────────────────────────────────────────────────
// 3. CHAT & MESSAGING ENGINE
// ────────────────────────────────────────────────

function getPairID(friendId) {
    return [currentUser.id, friendId].sort().join('_');
}

async function loadMessages() {
    if (!activeChatID) return;
    const container = document.getElementById('chat-messages');
    container.innerHTML = '<div class="loading">Loading messages...</div>';

    let query = _supabase.from('messages').select('*').order('created_at', { ascending: true });

    if (chatType === 'server') {
        query = query.eq('channel_id', activeChatID);
    } else {
        query = query.eq('chat_id', getPairID(activeChatID));
    }

    const { data, error } = await query;
    if (error) return console.error("Load Error:", error);

    container.innerHTML = ''; 
    data.forEach(msg => appendMessageUI(msg));
    scrollToBottom();
}

async function sendMessage() {
    const input = document.getElementById('chat-in');
    const text = input.value.trim();
    if (!text || !activeChatID || !currentUser) return;

    const msgObj = {
        sender_id: currentUser.id,
        content: text,
        username_static: document.getElementById('my-name').innerText,
        pfp_static: document.getElementById('my-pfp').src
    };

    if (chatType === 'server') {
        msgObj.channel_id = activeChatID;
    } else {
        msgObj.chat_id = getPairID(activeChatID);
        msgObj.receiver_id = activeChatID; 
    }

    input.value = ''; 
    const { error } = await _supabase.from('messages').insert([msgObj]);
    if (error) console.error("Insert Error:", error.message);
}

function appendMessageUI(msg) {
    const container = document.getElementById('chat-messages');
    const isMe = msg.sender_id === currentUser.id;
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isMe ? 'own' : ''}`;
    
    bubble.innerHTML = `
        <img src="${msg.pfp_static}" class="pfp-img" onclick="showProfile('${msg.sender_id}')" style="cursor:pointer; width:35px; height:35px;">
        <div class="msg-body">
            <div class="msg-header">
                <span class="username" style="font-weight:bold; font-size:11px; opacity:0.7;">${msg.username_static}</span>
            </div>
            <div class="msg-content">${msg.content}</div>
        </div>
    `;
    container.appendChild(bubble);
    scrollToBottom();
}

function scrollToBottom() {
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
}

// ────────────────────────────────────────────────
// 4. FRIENDS LOGIC (THE MISSING PIECES)
// ────────────────────────────────────────────────

function renderFriendsUI() {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = `
        <div style="padding:20px; animation: modalPop 0.3s ease;">
            <label style="font-size:11px; font-weight:bold; color:var(--accent); text-transform:uppercase;">Add Friend</label>
            <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
                <input type="text" id="friend-id-in" class="input-box" placeholder="Enter User ID...">
                <button class="aero-btn" onclick="sendFriendRequest()">Send Request</button>
            </div>
            <hr style="margin:20px 0; opacity:0.1;">
            <p style="font-size:11px; opacity:0.6; text-align:center;">
                Your ID:<br>
                <strong style="color:var(--text-main); font-family:monospace; user-select:all;">${currentUser.id}</strong>
            </p>
        </div>
    `;
}

async function sendFriendRequest() {
    const friendId = document.getElementById('friend-id-in').value.trim();
    if (!friendId) return alert("Please enter an ID.");
    if (friendId === currentUser.id) return alert("You cannot add yourself.");

    const { error } = await _supabase.from('friends').insert([
        { sender_id: currentUser.id, receiver_id: friendId, status: 'accepted' }
    ]);

    if (error) {
        alert("Error: Make sure the ID is correct.");
    } else {
        alert("Friend added!");
        setView('dm');
    }
}

// ────────────────────────────────────────────────
// 5. SERVER & CHANNEL LOGIC (FIXED)
// ────────────────────────────────────────────────

async function loadChannels(serverId) {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = ''; // FIX: Clear before loading

    const { data } = await _supabase.from('channels').select('*').eq('server_id', serverId);

    const inviteBtn = document.createElement('div');
    inviteBtn.className = 'friend-item';
    inviteBtn.style.color = 'var(--accent)';
    inviteBtn.innerHTML = `<strong>+ Copy Server ID</strong>`;
    inviteBtn.onclick = () => {
        navigator.clipboard.writeText(serverId);
        alert("Server ID copied!");
    };
    content.appendChild(inviteBtn);

    data?.forEach(ch => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerText = `# ${ch.name}`;
        div.onclick = () => {
            activeChatID = ch.id;
            chatType = 'server';
            loadMessages();
            document.querySelectorAll('.friend-item').forEach(i => i.classList.remove('active-chat'));
            div.classList.add('active-chat');
        };
        content.appendChild(div);
    });
}
async function loadServers() {
    const list = document.getElementById('server-list');
    list.innerHTML = '';

    // 1. ADD THE GLOBAL SERVER MANUALLY (For everyone)
    const globalDiv = document.createElement('div');
    globalDiv.className = 'server-icon global-icon';
    globalDiv.textContent = '🌎';
    globalDiv.title = "Global Hub";
    globalDiv.onclick = () => setView('server', '00000000-0000-0000-0000-000000000000');
    list.appendChild(globalDiv);

    // 2. LOAD PERSONAL SERVERS
    const { data: memberships } = await _supabase.from('server_members')
        .select('server_id')
        .eq('user_id', currentUser.id);

    if (memberships && memberships.length > 0) {
        const serverIds = memberships.map(m => m.server_id);
        const { data: servers } = await _supabase.from('servers').select('*').in('id', serverIds);

        servers?.forEach(s => {
            // Prevent duplicating the global server if someone joined it manually
            if (s.id === '00000000-0000-0000-0000-000000000000') return;

            const div = document.createElement('div');
            div.className = 'server-icon';
            div.dataset.serverId = s.id;
            
            if (s.icon.startsWith('http')) {
                div.style.backgroundImage = `url(${s.icon})`;
                div.style.backgroundSize = 'cover';
            } else {
                div.textContent = s.icon;
            }

            div.onclick = () => setView('server', s.id);
            list.appendChild(div);
        });
    }
}
// ────────────────────────────────────────────────
// 6. REMAINING CORE FUNCTIONS (AUTH & SETTINGS)
// ────────────────────────────────────────────────

function setupRealtime() {
    _supabase.channel('room1')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const msg = payload.new;
            if (chatType === 'server' && msg.channel_id === activeChatID) {
                appendMessageUI(msg);
            } else if (chatType === 'dm') {
                if (msg.chat_id === getPairID(activeChatID)) {
                    appendMessageUI(msg);
                }
            }
        }).subscribe();
}

async function handleAuth() {
    const email = document.getElementById('email-in').value;
    const password = document.getElementById('pass-in').value;
    const username = document.getElementById('username-in').value.trim();

    if (isLoginMode) {
        const { error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) alert(error.message); else location.reload();
    } else {
        const { data, error } = await _supabase.auth.signUp({ email, password });
        if (error) return alert(error.message);
        await _supabase.from('profiles').upsert([{
            id: data.user.id, username: username,
            pfp: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
        }]);
        alert("Account created! Now login.");
        toggleAuthMode();
    }
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('signup-fields').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('auth-main-btn').innerText = isLoginMode ? 'Login' : 'Sign Up';
}

async function loadServers() {
    const { data: memberships } = await _supabase.from('server_members').select('server_id').eq('user_id', currentUser.id);
    if (!memberships) return;
    const serverIds = memberships.map(m => m.server_id);
    const { data: servers } = await _supabase.from('servers').select('*').in('id', serverIds);
    const list = document.getElementById('server-list');
    list.innerHTML = '';
    servers?.forEach(s => {
        const div = document.createElement('div');
        div.className = 'server-icon';
        div.dataset.serverId = s.id;
        if (s.icon.startsWith('http')) div.style.backgroundImage = `url(${s.icon})`;
        else div.textContent = s.icon;
        div.onclick = () => setView('server', s.id);
        list.appendChild(div);
    });
}

function openServerSettings(serverId) {
    currentServerID = serverId;
    document.getElementById('server-settings-modal').style.display = 'flex';
}

function closeServerSettings() {
    document.getElementById('server-settings-modal').style.display = 'none';
}

async function loadDMList() {
    const { data } = await _supabase.from('friends').select('*, sender:profiles!friends_sender_id_fkey(*), receiver:profiles!friends_receiver_id_fkey(*)')
        .eq('status', 'accepted').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
    const content = document.getElementById('sidebar-content');
    if (!data || data.length === 0) {
        content.innerHTML = '<div style="padding:20px; opacity:0.6;">No friends yet. Add some in the Friends tab!</div>';
        return;
    }
    data.forEach(rel => {
        const friend = rel.sender_id === currentUser.id ? rel.receiver : rel.sender;
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.onclick = () => {
            activeChatID = friend.id; chatType = 'dm'; loadMessages();
            document.querySelectorAll('.friend-item').forEach(i => i.classList.remove('active-chat'));
            div.classList.add('active-chat');
        };
        div.innerHTML = `<img src="${friend.pfp}" class="pfp-img" style="width:30px; height:30px;"><span>${friend.username}</span>`;
        content.appendChild(div);
    });
}
