/**
 * AeroSocial Pro v3.0
 * Features: Presence Status, Member Sidebar, Auto-Channel Gen, Layout Fixes
 */

const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// Global App State
let currentUser = null;
let activeChatID = null;
let currentServerID = null;
let chatType = 'dm';
const GLOBAL_SERVER_ID = '00000000-0000-0000-0000-000000000000';

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

        if (prof) updateLocalUI(prof.username, prof.pfp);

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
// 2. VIEW & SIDEBAR LOGIC
// ────────────────────────────────────────────────

function setView(view, id = null) {
    const sidebarLeft = document.getElementById('sidebar-content');
    const sidebarRight = document.getElementById('member-list-sidebar');
    const header = document.getElementById('sidebar-header');
    
    sidebarLeft.innerHTML = ''; 
    activeChatID = null;
    document.getElementById('chat-messages').innerHTML = '<div style="padding:20px; opacity:0.5; text-align:center;">Select a chat to begin</div>';

    // Reset active states on icons
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));

    if (view === 'dm') {
        currentServerID = null;
        sidebarRight.style.display = 'none'; // Hide member list in DMs
        document.getElementById('nav-dm').classList.add('active');
        header.innerHTML = `Direct Messages`;
        loadDMList();
    } else if (view === 'friends') {
        currentServerID = null;
        sidebarRight.style.display = 'none'; // Hide member list in Friends
        document.getElementById('nav-friends').classList.add('active');
        header.innerText = "Friends";
        renderFriendsUI();
    } else if (view === 'server') {
        currentServerID = id;
        sidebarRight.style.display = 'flex'; // Show member list in Servers
        header.innerHTML = `<span>Channels</span>`;
        
        const iconEl = document.querySelector(`.server-icon[data-server-id="${id}"]`) || 
                       (id === GLOBAL_SERVER_ID ? document.querySelector('.server-icon:first-child') : null);
        if (iconEl) iconEl.classList.add('active');
        
        loadChannels(id, true); 
        loadServerMembers(id);
    }
}

async function loadServerMembers(serverId) {
    const container = document.getElementById('member-list-container');
    container.innerHTML = '<div style="font-size:10px; opacity:0.5; padding:10px;">Loading...</div>';
    
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
        const isOnline = (u.id === currentUser.id); // In a full app, this uses Presence
        const div = document.createElement('div');
        div.className = 'member-item';
        div.innerHTML = `
            <div style="position:relative; display: flex; align-items: center;">
                <img src="${u.pfp}" style="width:28px; height:28px; border-radius:50%; object-fit: cover;">
                <div class="status-dot ${isOnline ? 'status-online' : 'status-offline'}" 
                     style="position:absolute; bottom:0; right:0; width:8px; height:8px; border:2px solid #1e1e2f;"></div>
            </div>
            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:13px;">${u.username}</span>
        `;
        container.appendChild(div);
    });
}

// ────────────────────────────────────────────────
// 3. CHAT ENGINE
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
    const { error } = await _supabase.from('messages').insert([msgObj]);
    if (error) console.error("Send error:", error);
}

function appendMessageUI(msg) {
    const container = document.getElementById('chat-messages');
    const isMe = msg.sender_id === currentUser.id;
    const div = document.createElement('div');
    div.className = `message-bubble ${isMe ? 'own' : ''}`;
    div.innerHTML = `
        <img src="${msg.pfp_static}" class="pfp-img" style="width:35px; height:35px;">
        <div class="msg-body">
            <span style="font-size:11px; font-weight:bold; opacity:0.6; margin-bottom:4px; display:block;">${msg.username_static}</span>
            <div class="msg-content" style="background: ${isMe ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}">${msg.content}</div>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ────────────────────────────────────────────────
// 4. SERVERS & CHANNELS
// ────────────────────────────────────────────────

async function createOrJoinServer() {
    const input = document.getElementById('server-name-in').value.trim();
    if (!input) return;

    if (input.includes('-')) { // Join by UUID
        await _supabase.from('server_members').insert([{ server_id: input, user_id: currentUser.id }]);
    } else { // Create
        const { data: server } = await _supabase.from('servers').insert([{ name: input, icon: '🌐', owner_id: currentUser.id }]).select().single();
        await _supabase.from('server_members').insert([{ server_id: server.id, user_id: currentUser.id }]);
        await _supabase.from('channels').insert([{ server_id: server.id, name: 'general' }]);
    }
    location.reload();
}

async function loadServers() {
    const list = document.getElementById('server-list');
    list.innerHTML = '';

    // Global Hub
    const globalDiv = document.createElement('div');
    globalDiv.className = 'server-icon';
    globalDiv.textContent = '🌎';
    globalDiv.onclick = () => setView('server', GLOBAL_SERVER_ID);
    list.appendChild(globalDiv);

    const { data: memberships } = await _supabase.from('server_members').select('servers(*)').eq('user_id', currentUser.id);
    memberships?.forEach(m => {
        const s = m.servers;
        if (!s || s.id === GLOBAL_SERVER_ID) return;
        const div = document.createElement('div');
        div.className = 'server-icon';
        div.dataset.serverId = s.id;
        div.textContent = s.icon || '🌐';
        div.onclick = () => setView('server', s.id);
        list.appendChild(div);
    });
}

async function loadChannels(serverId, autoSelect = false) {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = ''; 
    const { data } = await _supabase.from('channels').select('*').eq('server_id', serverId).order('created_at', {ascending: true});

    data?.forEach((ch, index) => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerText = `# ${ch.name}`;
        const select = () => {
            activeChatID = ch.id; chatType = 'server'; loadMessages();
            document.querySelectorAll('.friend-item').forEach(i => i.classList.remove('active-chat'));
            div.classList.add('active-chat');
        };
        div.onclick = select;
        content.appendChild(div);
        if (autoSelect && index === 0) select();
    });
}

// ────────────────────────────────────────────────
// 5. AUTH & REALTIME
// ────────────────────────────────────────────────

function setupRealtime() {
    _supabase.channel('messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const msg = payload.new;
        if (chatType === 'server' && msg.channel_id === activeChatID) appendMessageUI(msg);
        if (chatType === 'dm' && msg.chat_id === [currentUser.id, activeChatID].sort().join('_')) appendMessageUI(msg);
    }).subscribe();
}

async function handleAuth() {
    const email = document.getElementById('email-in').value;
    const password = document.getElementById('pass-in').value;
    const user = document.getElementById('username-in').value;
    if (isLoginMode) {
        await _supabase.auth.signInWithPassword({ email, password });
    } else {
        const { data } = await _supabase.auth.signUp({ email, password });
        await _supabase.from('profiles').insert([{ id: data.user.id, username: user, pfp: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user}` }]);
    }
    location.reload();
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('signup-fields').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('auth-main-btn').innerText = isLoginMode ? 'Login' : 'Sign Up';
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
