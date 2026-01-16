/**
 * AeroSocial Pro v3.1 - Full Unified Script
 * Includes: Auth Fix, Member List, Auto-Channels, Status Indicators
 */

const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// Global App State
let currentUser = null;
let activeChatID = null;
let currentServerID = null;
let chatType = 'dm';
let isLoginMode = true; 
const GLOBAL_SERVER_ID = '00000000-0000-0000-0000-000000000000';

// ────────────────────────────────────────────────
// 1. APP INITIALIZATION & AUTH CHECK
// ────────────────────────────────────────────────

window.onload = async () => {
    // Check if user is already logged in
    const { data: { user } } = await _supabase.auth.getUser();

    if (user) {
        currentUser = user;
        document.getElementById('auth-overlay').style.display = 'none';

        // Load user profile details
        const { data: prof } = await _supabase.from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (prof) updateLocalUI(prof.username, prof.pfp);

        setupRealtime();
        loadServers();
        setView('dm'); 
    } else {
        // Show login screen if not logged in
        document.getElementById('auth-overlay').style.display = 'flex';
    }
};

function updateLocalUI(name, pfp) {
    document.getElementById('my-name').textContent = name;
    document.getElementById('my-pfp').src = pfp || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
}

// ────────────────────────────────────────────────
// 2. AUTHENTICATION (LOGIN & SIGNUP)
// ────────────────────────────────────────────────

async function handleAuth() {
    const email = document.getElementById('email-in').value.trim();
    const password = document.getElementById('pass-in').value.trim();
    const username = document.getElementById('username-in').value.trim();

    if (!email || !password) return alert("Please fill in all fields.");

    if (isLoginMode) {
        // LOGIN
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) return alert(error.message);
        location.reload();
    } else {
        // SIGNUP
        if (!username) return alert("Please enter a username.");
        const { data, error } = await _supabase.auth.signUp({ email, password });
        
        if (error) return alert(error.message);
        
        if (data.user) {
            // Create the profile record
            await _supabase.from('profiles').insert([{ 
                id: data.user.id, 
                username: username, 
                pfp: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}` 
            }]);
            alert("Signup successful! Please login.");
            toggleAuthMode();
        }
    }
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    const signupFields = document.getElementById('signup-fields');
    const authBtn = document.getElementById('auth-main-btn');
    const title = document.querySelector('.auth-box h2');

    signupFields.style.display = isLoginMode ? 'none' : 'block';
    authBtn.innerText = isLoginMode ? 'Login' : 'Create Account';
    title.innerText = isLoginMode ? 'AeroSocial Login' : 'Join AeroSocial';
}

// ────────────────────────────────────────────────
// 3. NAVIGATION & VIEW LOGIC
// ────────────────────────────────────────────────

function setView(view, id = null) {
    const sidebarContent = document.getElementById('sidebar-content');
    const memberSidebar = document.getElementById('member-list-sidebar');
    const header = document.getElementById('sidebar-header');
    
    sidebarContent.innerHTML = ''; 
    activeChatID = null;
    document.getElementById('chat-messages').innerHTML = '<div style="padding:20px; opacity:0.5; text-align:center;">Select a chat to begin</div>';

    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));

    if (view === 'dm') {
        currentServerID = null;
        memberSidebar.style.display = 'none';
        header.innerHTML = `Direct Messages`;
        loadDMList();
    } else if (view === 'friends') {
        currentServerID = null;
        memberSidebar.style.display = 'none';
        header.innerText = "Friends";
        renderFriendsUI();
    } else if (view === 'server') {
        currentServerID = id;
        memberSidebar.style.display = 'flex';
        header.innerHTML = `<span>Channels</span>`;
        
        const iconEl = document.querySelector(`.server-icon[data-server-id="${id}"]`);
        if (iconEl) iconEl.classList.add('active');
        
        loadChannels(id, true); // true = auto-select #general
        loadServerMembers(id);
    }
}

async function loadServerMembers(serverId) {
    const container = document.getElementById('member-list-container');
    container.innerHTML = '<div style="font-size:10px; opacity:0.3; padding:10px;">Loading...</div>';
    
    let users = [];
    if (serverId === GLOBAL_SERVER_ID) {
        const { data } = await _supabase.from('profiles').select('*').limit(50);
        users = data || [];
    } else {
        const { data } = await _supabase.from('server_members').select('profiles(*)').eq('server_id', serverId);
        users = data?.map(m => m.profiles) || [];
    }

    container.innerHTML = '';
    users.forEach(u => {
        const isMe = (u.id === currentUser.id);
        const div = document.createElement('div');
        div.className = 'member-item';
        div.innerHTML = `
            <div style="position:relative;">
                <img src="${u.pfp}" style="width:28px; height:28px; border-radius:50%;">
                <div class="status-dot ${isMe ? 'status-online' : 'status-offline'}" style="position:absolute; bottom:0; right:0; width:8px; height:8px; border:2px solid #1e1e2f;"></div>
            </div>
            <span style="font-size:13px; opacity:${isMe ? '1' : '0.7'};">${u.username}</span>
        `;
        container.appendChild(div);
    });
}

// ────────────────────────────────────────────────
// 4. CHAT ENGINE
// ────────────────────────────────────────────────

async function loadMessages() {
    if (!activeChatID) return;
    const container = document.getElementById('chat-messages');
    
    let query = _supabase.from('messages').select('*').order('created_at', { ascending: true });
    if (chatType === 'server') {
        query = query.eq('channel_id', activeChatID);
    } else {
        const pairID = [currentUser.id, activeChatID].sort().join('_');
        query = query.eq('chat_id', pairID);
    }

    const { data } = await query;
    container.innerHTML = ''; 
    data?.forEach(msg => appendMessageUI(msg));
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('chat-in');
    const text = input.value.trim();
    if (!text || !activeChatID) return;

    const msgObj = {
        sender_id: currentUser.id,
        content: text,
        username_static: document.getElementById('my-name').innerText,
        pfp_static: document.getElementById('my-pfp').src,
        channel_id: chatType === 'server' ? activeChatID : null,
        chat_id: chatType === 'dm' ? [currentUser.id, activeChatID].sort().join('_') : null
    };

    input.value = ''; 
    await _supabase.from('messages').insert([msgObj]);
}

function appendMessageUI(msg) {
    const container = document.getElementById('chat-messages');
    const isMe = msg.sender_id === currentUser.id;
    const div = document.createElement('div');
    div.className = `message-bubble ${isMe ? 'own' : ''}`;
    div.innerHTML = `
        <img src="${msg.pfp_static}" class="pfp-img" style="width:35px; height:35px;">
        <div class="msg-body">
            <span style="font-size:11px; font-weight:bold; opacity:0.5;">${msg.username_static}</span>
            <div class="msg-content">${msg.content}</div>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ────────────────────────────────────────────────
// 5. SERVER & CHANNEL LOGIC
// ────────────────────────────────────────────────

async function createOrJoinServer() {
    const name = document.getElementById('server-name-in').value.trim();
    if (!name) return;

    if (name.includes('-')) {
        // Join
        await _supabase.from('server_members').insert([{ server_id: name, user_id: currentUser.id }]);
    } else {
        // Create
        const { data: s } = await _supabase.from('servers').insert([{ name: name, icon: '🌐', owner_id: currentUser.id }]).select().single();
        await _supabase.from('server_members').insert([{ server_id: s.id, user_id: currentUser.id }]);
        await _supabase.from('channels').insert([{ server_id: s.id, name: 'general' }]);
    }
    location.reload();
}

async function loadServers() {
    const list = document.getElementById('server-list');
    list.innerHTML = '';

    // Global Hub
    const globalDiv = document.createElement('div');
    globalDiv.className = 'server-icon';
    globalDiv.dataset.serverId = GLOBAL_SERVER_ID;
    globalDiv.textContent = '🌎';
    globalDiv.onclick = () => setView('server', GLOBAL_SERVER_ID);
    list.appendChild(globalDiv);

    const { data } = await _supabase.from('server_members').select('servers(*)').eq('user_id', currentUser.id);
    data?.forEach(m => {
        if (!m.servers || m.servers.id === GLOBAL_SERVER_ID) return;
        const div = document.createElement('div');
        div.className = 'server-icon';
        div.dataset.serverId = m.servers.id;
        div.textContent = m.servers.icon || '🌐';
        div.onclick = () => setView('server', m.servers.id);
        list.appendChild(div);
    });
}

async function loadChannels(serverId, autoSelect = false) {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = '';
    const { data: channels } = await _supabase.from('channels').select('*').eq('server_id', serverId).order('created_at', {ascending: true});

    channels?.forEach((ch, i) => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerText = `# ${ch.name}`;
        const select = () => {
            activeChatID = ch.id; chatType = 'server'; loadMessages();
            document.querySelectorAll('.friend-item').forEach(el => el.classList.remove('active-chat'));
            div.classList.add('active-chat');
        };
        div.onclick = select;
        content.appendChild(div);
        if (autoSelect && i === 0) select();
    });
}

// ────────────────────────────────────────────────
// 6. REALTIME SUBSCRIPTION
// ────────────────────────────────────────────────

function setupRealtime() {
    _supabase.channel('room1').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const msg = payload.new;
        if (chatType === 'server' && msg.channel_id === activeChatID) appendMessageUI(msg);
        if (chatType === 'dm' && msg.chat_id === [currentUser.id, activeChatID].sort().join('_')) appendMessageUI(msg);
    }).subscribe();
}

async function loadDMList() {
    const { data } = await _supabase.from('friends').select('*, sender:profiles!friends_sender_id_fkey(*), receiver:profiles!friends_receiver_id_fkey(*)')
        .eq('status', 'accepted').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
    
    const content = document.getElementById('sidebar-content');
    data?.forEach(rel => {
        const friend = rel.sender_id === currentUser.id ? rel.receiver : rel.sender;
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `<img src="${friend.pfp}" style="width:24px; height:24px; border-radius:50%; margin-right:10px;"> <span>${friend.username}</span>`;
        div.onclick = () => {
            activeChatID = friend.id; chatType = 'dm'; loadMessages();
            document.querySelectorAll('.friend-item').forEach(i => i.classList.remove('active-chat'));
            div.classList.add('active-chat');
        };
        content.appendChild(div);
    });
}

function renderFriendsUI() {
    document.getElementById('sidebar-content').innerHTML = `
        <div style="padding:15px;">
            <p style="font-size:11px; opacity:0.5;">YOUR ID: ${currentUser.id}</p>
            <input type="text" id="friend-id-in" class="input-box" placeholder="User ID..." style="margin-top:10px;">
            <button class="aero-btn" onclick="sendFriendRequest()" style="margin-top:10px; width:100%;">Add Friend</button>
        </div>
    `;
}

async function sendFriendRequest() {
    const id = document.getElementById('friend-id-in').value.trim();
    if (!id) return;
    await _supabase.from('friends').insert([{ sender_id: currentUser.id, receiver_id: id, status: 'accepted' }]);
    alert("Friend added!");
    setView('dm');
}
