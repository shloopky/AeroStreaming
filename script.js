/**
 * AeroSocial Pro v4.0 - Master Absolute Edition
 * RESTORED: Profile UI, Server Settings, Lounge System, Friend System
 */
const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// --- GLOBAL STATE ---
let currentUser = null;
let activeChatID = null;
let currentServerID = null;
let chatType = 'dm';
let isLoginMode = true;
const GLOBAL_SERVER_ID = '00000000-0000-0000-0000-000000000000';

// ────────────────────────────────────────────────
// 1. INITIALIZATION & AUTH
// ────────────────────────────────────────────────
window.onload = async () => {
    const { data: { user } } = await _supabase.auth.getUser();
    if (user) {
        currentUser = user;
        document.getElementById('auth-overlay').style.display = 'none';
        
        const { data: prof } = await _supabase.from('profiles').select('*').eq('id', user.id).single();
        if (prof) updateLocalUI(prof.username, prof.pfp);
        
        setupRealtime();
        loadServers();
        // Ensure Global server exists for first time setup
        await ensureGlobalGeneralChannel();
        setView('dm');
    } else {
        document.getElementById('auth-overlay').style.display = 'flex';
    }
};

function updateLocalUI(name, pfp) {
    const nameEl = document.getElementById('my-name');
    const pfpEl = document.getElementById('my-pfp');
    if(nameEl) nameEl.textContent = name || 'User';
    if(pfpEl) pfpEl.src = pfp || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
}

async function handleAuth() {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-pass').value;
    
    if (isLoginMode) {
        const { error } = await _supabase.auth.signInWithPassword({ email, password: pass });
        if (error) alert(error.message); else location.reload();
    } else {
        const { error } = await _supabase.auth.signUp({ email, password: pass });
        if (error) alert(error.message); else alert("Check email or try logging in!");
    }
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.querySelector('#auth-overlay button').textContent = isLoginMode ? "Login" : "Sign Up";
}

// ────────────────────────────────────────────────
// 2. NAVIGATION & VIEW
// ────────────────────────────────────────────────
async function setView(view, id = null) {
    currentServerID = id;
    const sidebarRight = document.getElementById('member-list-sidebar');
    const header = document.getElementById('sidebar-header');
    const content = document.getElementById('sidebar-content');
    
    content.innerHTML = '';
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));

    if (view === 'dm') {
        sidebarRight.style.display = 'none';
        header.innerHTML = `<span>Direct Messages</span> <button class="aero-btn" style="padding:4px 10px; font-size:12px;" onclick="setView('friends')">+</button>`;
        loadDMList();
    }
    else if (view === 'friends') {
        sidebarRight.style.display = 'none';
        header.innerHTML = `<span>Friends</span> <button class="aero-btn" style="padding:4px 10px; font-size:12px;" onclick="setView('dm')">←</button>`;
        renderFriendsUI();
    }
    else {
        // Server View
        sidebarRight.style.display = 'flex';
        const { data: server } = await _supabase.from('servers').select('name').eq('id', id).single();
        
        header.innerHTML = `
            ${server ? server.name : 'Server'}
            <div style="display:flex; gap:5px;">
                <span onclick="createChannel()" style="cursor:pointer; font-size:16px;">+</span>
                <span onclick="createLounge()" style="cursor:pointer; font-size:16px;">🔊</span>
                <span onclick="openServerSettings('${id}')" style="cursor:pointer; font-size:16px;">⚙️</span>
            </div>
        `;
        loadChannels(id, true);
        loadServerMembers(id);
    }
}

// ────────────────────────────────────────────────
// 3. FRIENDS LOGIC (RESTORED)
// ────────────────────────────────────────────────
async function loadDMList() {
    // This is the complex query from the original request
    const { data } = await _supabase.from('friends')
        .select('*, sender:profiles!friends_sender_id_fkey(*), receiver:profiles!friends_receiver_id_fkey(*)')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
        
    const content = document.getElementById('sidebar-content');
    if (!data || data.length === 0) content.innerHTML = '<div style="padding:20px; opacity:0.5; font-size:12px;">No friends yet. Click + to add some!</div>';

    data?.forEach(rel => {
        const f = rel.sender_id === currentUser.id ? rel.receiver : rel.sender;
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `
            <div class="pfp-container" style="width:24px; height:24px;">
                <img src="${f.pfp || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.username}`}" class="pfp-img circle">
            </div>
            ${f.username}
        `;
        div.onclick = () => {
            activeChatID = f.id; 
            chatType = 'dm'; 
            loadMessages();
            document.querySelectorAll('.friend-item').forEach(el => el.classList.remove('active-chat'));
            div.classList.add('active-chat');
        };
        content.appendChild(div);
    });
}

function renderFriendsUI() {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = `
        <div style="padding:20px;">
            <h4 style="margin:0 0 10px 0; opacity:0.8;">ADD BY ID</h4>
            <input id="friend-id-in" class="input-box" placeholder="Enter User UUID">
            <button class="aero-btn full-width" onclick="sendFriendRequest()">Add Friend</button>
            
            <div style="margin-top:30px; border-top:1px solid rgba(255,255,255,0.1); padding-top:20px;">
                <h4 style="margin:0 0 10px 0; opacity:0.8;">YOUR ID</h4>
                <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:5px; font-family:monospace; font-size:11px; word-break:break-all; user-select:all;">
                    ${currentUser.id}
                </div>
            </div>
        </div>
    `;
}

async function sendFriendRequest() {
    const friendId = document.getElementById('friend-id-in').value.trim();
    if (!friendId || friendId === currentUser.id) return alert("Invalid ID.");
    
    // Auto-accept logic as per original code
    const { error } = await _supabase.from('friends').insert([{ 
        sender_id: currentUser.id, 
        receiver_id: friendId, 
        status: 'accepted' 
    }]);
    
    if (error) alert("Error: " + error.message);
    else { 
        alert("Friend Added!"); 
        setView('dm'); 
    }
}

// ────────────────────────────────────────────────
// 4. CHANNELS, SERVERS, LOUNGES
// ────────────────────────────────────────────────
async function loadChannels(serverId, autoSelect = false) {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = '';
   
    const { data: channels } = await _supabase.from('channels')
        .select('*').eq('server_id', serverId)
        .order('is_lounge', { ascending: true })
        .order('created_at', { ascending: true });

    channels?.forEach((ch, i) => {
        const div = document.createElement('div');
        div.className = ch.is_lounge ? 'friend-item lounge-item' : 'friend-item';
        div.innerHTML = `<span style="opacity:0.6">${ch.is_lounge ? '🔊' : '#'}</span> ${ch.name}`;
        
        div.onclick = () => {
            activeChatID = ch.id; 
            chatType = ch.is_lounge ? 'lounge' : 'server';
            loadMessages();
            document.querySelectorAll('.friend-item').forEach(el => el.classList.remove('active-chat'));
            div.classList.add('active-chat');
        };
        content.appendChild(div);
        if (autoSelect && i === 0) div.click();
    });
}

async function createLounge() {
    const name = prompt("Enter Lounge Name:");
    if (!name || !currentServerID) return;
    await _supabase.from('channels').insert([{ server_id: currentServerID, name, is_lounge: true }]);
    loadChannels(currentServerID);
}

async function createChannel() {
    const name = prompt("Enter Text Channel Name:");
    if (!name || !currentServerID) return;
    await _supabase.from('channels').insert([{ server_id: currentServerID, name, is_lounge: false }]);
    loadChannels(currentServerID);
}

// ────────────────────────────────────────────────
// 5. MESSAGING
// ────────────────────────────────────────────────
async function loadMessages() {
    if (!activeChatID) return;
    const container = document.getElementById('chat-messages');
    let query = _supabase.from('messages').select('*').order('created_at', { ascending: true });
    
    if (chatType === 'server' || chatType === 'lounge') {
        query = query.eq('channel_id', activeChatID);
    } else {
        query = query.eq('chat_id', [currentUser.id, activeChatID].sort().join('_'));
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
        username_static: document.getElementById('my-name').textContent,
        pfp_static: document.getElementById('my-pfp').src,
        channel_id: (chatType !== 'dm') ? activeChatID : null,
        chat_id: (chatType === 'dm') ? [currentUser.id, activeChatID].sort().join('_') : null
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
        <div class="pfp-container" style="width:30px; height:30px;">
             <img src="${msg.pfp_static}" class="pfp-img circle">
        </div>
        <div class="msg-body">
            <div style="font-size:10px; opacity:0.5; margin-bottom:2px;">${msg.username_static}</div>
            <div class="msg-content">${msg.content}</div>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ────────────────────────────────────────────────
// 6. SERVER LIST & UTILS
// ────────────────────────────────────────────────
async function loadServers() {
    const list = document.getElementById('server-list');
    list.innerHTML = `
        <div class="server-icon active" onclick="setView('dm')">DM</div>
        <div class="rail-divider"></div>
    `;
    
    const { data } = await _supabase.from('server_members').select('servers(*)').eq('user_id', currentUser.id);
    data?.forEach(m => {
        if (!m.servers) return;
        const div = document.createElement('div');
        div.className = 'server-icon';
        div.textContent = m.servers.icon || '🌐';
        div.onclick = () => setView('server', m.servers.id);
        list.appendChild(div);
    });
    
    // Add button
    const addBtn = document.createElement('div');
    addBtn.className = 'server-icon';
    addBtn.textContent = '+';
    addBtn.onclick = () => document.getElementById('join-modal').style.display = 'flex';
    list.appendChild(addBtn);
}

async function loadServerMembers(serverId) {
    const container = document.getElementById('member-list-container');
    container.innerHTML = '';
    const { data } = await _supabase.from('server_members').select('profiles(*)').eq('server_id', serverId);
    
    data?.forEach(m => {
        const u = m.profiles;
        const div = document.createElement('div');
        div.className = 'member-item';
        div.innerHTML = `
            <div class="pfp-container" style="width:20px; height:20px;">
                <img src="${u.pfp || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`}" class="pfp-img circle">
            </div>
            ${u.username}
        `;
        container.appendChild(div);
    });
}

// ────────────────────────────────────────────────
// 7. PROFILE & MODALS
// ────────────────────────────────────────────────
function openProfile() {
    document.getElementById('edit-username').value = document.getElementById('my-name').textContent;
    document.getElementById('edit-pfp').value = document.getElementById('my-pfp').src;
    document.getElementById('profile-modal').style.display = 'flex';
}

async function saveProfile() {
    const username = document.getElementById('edit-username').value;
    const pfp = document.getElementById('edit-pfp').value;
    await _supabase.from('profiles').update({ username, pfp }).eq('id', currentUser.id);
    updateLocalUI(username, pfp);
    closeModals();
}

async function openServerSettings(serverId) {
    const { data } = await _supabase.from('servers').select('*').eq('id', serverId).single();
    if (!data || data.owner_id !== currentUser.id) return alert("Only the owner can edit settings.");
    
    document.getElementById('set-server-name').value = data.name;
    document.getElementById('set-server-icon').value = data.icon || '';
    document.getElementById('server-settings-modal').style.display = 'flex';
}

async function handleServerAction() {
    const val = document.getElementById('server-input').value.trim();
    if (!val) return;
    
    if (val.length > 30) {
        // Join by ID
        const { error } = await _supabase.from('server_members').insert({ server_id: val, user_id: currentUser.id });
        if(error) alert(error.message);
    } else {
        // Create
        const { data } = await _supabase.from('servers').insert({ name: val, owner_id: currentUser.id }).select().single();
        if (data) {
            await _supabase.from('server_members').insert({ server_id: data.id, user_id: currentUser.id });
            await _supabase.from('channels').insert({ server_id: data.id, name: 'general' });
        }
    }
    closeModals();
    loadServers();
}

function closeModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'); }

async function ensureGlobalGeneralChannel() {
    const { data } = await _supabase.from('channels').select('id').eq('server_id', GLOBAL_SERVER_ID).eq('name', 'general').maybeSingle();
    if (!data) await _supabase.from('channels').insert({ server_id: GLOBAL_SERVER_ID, name: 'general' });
}

function setupRealtime() {
    _supabase.channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
            if (payload.new.channel_id === activeChatID || 
               (chatType === 'dm' && payload.new.chat_id === [currentUser.id, activeChatID].sort().join('_'))) {
                appendMessageUI(payload.new);
            }
        })
        .subscribe();
}
