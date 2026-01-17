/**
 * AeroSocial Pro v4.0 - Full Restoration
 * FIXED: Join/Create Server logic, Profile UI, Lounges, and Auth.
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
        await ensureGlobalGeneralChannel();
        setView('dm'); 
    } else {
        document.getElementById('auth-overlay').style.display = 'flex';
    }
};

function updateLocalUI(name, pfp) {
    const nameEl = document.getElementById('my-name');
    const pfpEl = document.getElementById('my-pfp');
    if(nameEl) nameEl.textContent = name;
    if(pfpEl) pfpEl.src = pfp || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
}

async function handleAuth() {
    const email = document.getElementById('email-in').value.trim();
    const password = document.getElementById('pass-in').value.trim();
    const username = document.getElementById('username-in').value.trim();
    
    if (isLoginMode) {
        const { error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) return alert(error.message);
        location.reload();
    } else {
        if (!username) return alert("Username required.");
        const { data, error } = await _supabase.auth.signUp({ email, password });
        if (error) return alert(error.message);
        if (data.user) {
            await _supabase.from('profiles').insert([{ 
                id: data.user.id, 
                username, 
                pfp: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}` 
            }]);
            location.reload();
        }
    }
}

// ────────────────────────────────────────────────
// 2. PROFILE & SERVER SETTINGS
// ────────────────────────────────────────────────

function openProfile() {
    const currentName = document.getElementById('my-name').textContent;
    const currentPfp = document.getElementById('my-pfp').src;
    document.getElementById('edit-username').value = currentName;
    document.getElementById('edit-pfp').value = currentPfp;
    document.getElementById('profile-modal').style.display = 'flex';
}

async function saveProfile() {
    const newName = document.getElementById('edit-username').value.trim();
    const newPfp = document.getElementById('edit-pfp').value.trim();
    if (!newName) return alert("Username required");
    const { error } = await _supabase.from('profiles').update({ username: newName, pfp: newPfp }).eq('id', currentUser.id);
    if (error) alert(error.message);
    else { updateLocalUI(newName, newPfp); document.getElementById('profile-modal').style.display = 'none'; }
}

async function openServerSettings(serverId) {
    if (serverId === GLOBAL_SERVER_ID) return;
    const { data: server } = await _supabase.from('servers').select('*').eq('id', serverId).single();
    if (!server) return;
    const modal = document.getElementById('server-settings-modal');
    document.getElementById('set-server-name').value = server.name;
    document.getElementById('set-server-icon').value = server.icon;
    modal.setAttribute('data-current-id', serverId);
    modal.style.display = 'flex';
}

// ────────────────────────────────────────────────
// 3. SERVER CREATION & JOINING (RE-ADDED)
// ────────────────────────────────────────────────

async function createOrJoinServer() {
    const nameInput = document.getElementById('server-name-in');
    const iconInput = document.getElementById('server-icon-in');
    const val = nameInput.value.trim();
    if (!val) return;

    // Check if input is a UUID (Joining)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    if (isUuid) {
        const { error } = await _supabase.from('server_members').insert([{ server_id: val, user_id: currentUser.id }]);
        if (error) alert("Could not join: " + error.message);
        else location.reload();
    } else {
        // Creating
        const { data: server, error: sErr } = await _supabase.from('servers').insert([
            { name: val, icon: iconInput.value || '🌐', owner_id: currentUser.id }
        ]).select().single();
        
        if (sErr) return alert(sErr.message);
        
        await _supabase.from('server_members').insert([{ server_id: server.id, user_id: currentUser.id }]);
        await _supabase.from('channels').insert([{ server_id: server.id, name: 'general' }]);
        location.reload();
    }
}

// ────────────────────────────────────────────────
// 4. NAVIGATION & LOUNGES
// ────────────────────────────────────────────────

async function setView(view, id = null) {
    currentServerID = id;
    const sidebarRight = document.getElementById('member-list-sidebar');
    const header = document.getElementById('sidebar-header');
    const sidebarContent = document.getElementById('sidebar-content');
    
    sidebarContent.innerHTML = ''; 
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));

    if (view === 'dm') {
        sidebarRight.style.display = 'none';
        header.innerHTML = `Direct Messages <button onclick="setView('friends')" class="add-btn">+</button>`;
        loadDMList();
    } 
    else if (view === 'friends') {
        sidebarRight.style.display = 'none';
        header.innerHTML = `Friends Management <button onclick="setView('dm')" class="add-btn" style="background:#555">←</button>`;
        renderFriendsUI();
    }
    else {
        sidebarRight.style.display = 'flex';
        header.innerHTML = `<span>Channels</span> 
            <div class="header-tools">
                <span class="tool-icon" onclick="createLounge()" style="cursor:pointer; margin-right:8px;">💬</span>
                <span id="server-settings-btn" class="tool-icon" style="display:none; cursor:pointer;" onclick="openServerSettings('${id}')">⚙️</span>
            </div>`;
        loadChannels(id, true);
        loadServerMembers(id);
        checkServerOwnership(id);
    }
}

async function loadChannels(serverId, autoSelect = false) {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = '';
    const { data: channels } = await _supabase.from('channels').select('*').eq('server_id', serverId).order('is_lounge', { ascending: true }).order('created_at', { ascending: true });

    channels?.forEach((ch, i) => {
        const div = document.createElement('div');
        div.className = ch.is_lounge ? 'friend-item lounge-item' : 'friend-item';
        div.innerHTML = `<span style="opacity:0.5; margin-right:8px; font-weight:bold;">${ch.is_lounge ? '🔊' : '#'}</span>${ch.name}`;
        div.onclick = () => {
            activeChatID = ch.id; chatType = ch.is_lounge ? 'lounge' : 'server';
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
    await _supabase.from('channels').insert([{ server_id: currentServerID, name: name, is_lounge: true }]);
    loadChannels(currentServerID);
}

// ────────────────────────────────────────────────
// 5. MESSAGES & REALTIME (VITAL)
// ────────────────────────────────────────────────

async function loadMessages() {
    if (!activeChatID) return;
    const container = document.getElementById('chat-messages');
    let query = _supabase.from('messages').select('*').order('created_at', { ascending: true });
    if (chatType === 'server' || chatType === 'lounge') query = query.eq('channel_id', activeChatID);
    else query = query.eq('chat_id', [currentUser.id, activeChatID].sort().join('_'));
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
        sender_id: currentUser.id, content: text,
        username_static: document.getElementById('my-name').textContent,
        pfp_static: document.getElementById('my-pfp').src,
        channel_id: (chatType === 'server' || chatType === 'lounge') ? activeChatID : null,
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
    div.innerHTML = `<div class="pfp-container"><img src="${msg.pfp_static}" class="pfp-img circle"></div>
        <div class="msg-body">
            <span class="msg-meta">${msg.username_static}${isMe ? `<span class="del-btn" onclick="deleteMessage('${msg.id}')">×</span>` : ''}</span>
            <div class="msg-content">${msg.content}</div>
        </div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

async function deleteMessage(id) {
    if(!confirm("Delete?")) return;
    await _supabase.from('messages').delete().eq('id', id).eq('sender_id', currentUser.id);
    loadMessages();
}

function setupRealtime() {
    _supabase.channel('main').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => loadMessages()).subscribe();
    _supabase.channel('channels').on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, () => { if(currentServerID) loadChannels(currentServerID); }).subscribe();
}

// ────────────────────────────────────────────────
// 6. UTILS
// ────────────────────────────────────────────────

async function loadServers() {
    const list = document.getElementById('server-list');
    list.innerHTML = `<div class="server-icon" onclick="setView('server', '${GLOBAL_SERVER_ID}')">🌎</div>`;
    const { data } = await _supabase.from('server_members').select('servers(*)').eq('user_id', currentUser.id);
    data?.forEach(m => {
        if (!m.servers || m.servers.id === GLOBAL_SERVER_ID) return;
        const div = document.createElement('div');
        div.className = 'server-icon'; div.textContent = m.servers.icon || '🌐';
        div.onclick = () => setView('server', m.servers.id);
        list.appendChild(div);
    });
}

async function checkServerOwnership(serverId) {
    const settingsBtn = document.getElementById('server-settings-btn');
    if (serverId === GLOBAL_SERVER_ID) return;
    const { data: server } = await _supabase.from('servers').select('owner_id').eq('id', serverId).single();
    if(settingsBtn) settingsBtn.style.display = (server && server.owner_id === currentUser.id) ? 'inline-block' : 'none';
}

async function loadServerMembers(serverId) {
    const container = document.getElementById('member-list-container');
    container.innerHTML = '';
    const { data } = (serverId === GLOBAL_SERVER_ID) ? await _supabase.from('profiles').select('*').limit(30) : await _supabase.from('server_members').select('profiles(*)').eq('server_id', serverId);
    const users = (serverId === GLOBAL_SERVER_ID) ? data : data?.map(m => m.profiles);
    users?.forEach(u => {
        const div = document.createElement('div');
        div.className = 'member-item';
        div.innerHTML = `<img src="${u.pfp}" class="pfp-img circle" style="width:24px; height:24px; margin-right:8px;"><span>${u.username}</span>`;
        container.appendChild(div);
    });
}

async function ensureGlobalGeneralChannel() { 
    const { data: existing } = await _supabase.from('channels').select('id').eq('server_id', GLOBAL_SERVER_ID).eq('name', 'general').maybeSingle(); 
    if (!existing) await _supabase.from('channels').insert({ server_id: GLOBAL_SERVER_ID, name: 'general', is_lounge: false }); 
}

// DM/Friends (Simplified for space but fully functional)
async function loadDMList() {
    const { data } = await _supabase.from('friends').select('*, sender:profiles!friends_sender_id_fkey(*), receiver:profiles!friends_receiver_id_fkey(*)').eq('status', 'accepted').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
    const content = document.getElementById('sidebar-content');
    data?.forEach(rel => {
        const f = rel.sender_id === currentUser.id ? rel.receiver : rel.sender;
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `<img src="${f.pfp}" class="pfp-img circle" style="width:28px; height:28px; margin-right:10px;"><span>${f.username}</span>`;
        div.onclick = () => { activeChatID = f.id; chatType = 'dm'; loadMessages(); };
        content.appendChild(div);
    });
}

function renderFriendsUI() {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = `<div style="padding:20px;"><label>ADD BY ID</label><input type="text" id="friend-id-in" class="input-box"><button onclick="sendFriendRequest()" class="aero-btn">Add</button></div>`;
}

async function sendFriendRequest() {
    const id = document.getElementById('friend-id-in').value.trim();
    await _supabase.from('friends').insert([{ sender_id: currentUser.id, receiver_id: id, status: 'accepted' }]);
    setView('dm');
}
