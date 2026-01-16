/**
 * AeroSocial Pro v4.0 - Ultimate Master Edition
 * Features: Auth, Server Management (Settings/Delete), Lounges (Multi-user Server Chat),
 * Friend System (ID Based), Profile Editing, and Real-time Sync.
 */

const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// --- GLOBAL STATE ---
let currentUser = null;
let activeChatID = null;
let currentServerID = null;
let chatType = 'dm'; // 'dm', 'server', or 'lounge'
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
// 2. SERVER & LOUNGE LOGIC
// ────────────────────────────────────────────────

async function createOrJoinServer() {
    const input = document.getElementById('server-name-in').value.trim();
    const icon = document.getElementById('server-icon-in')?.value.trim() || "🌐";
    if (!input) return;

    if (input.length > 20 && input.includes('-')) {
        const { error } = await _supabase.from('server_members').insert([{ server_id: input, user_id: currentUser.id }]);
        if (error) alert("Could not join server."); else location.reload();
    } else {
        const { data: server, error: sErr } = await _supabase.from('servers').insert([{ name: input, icon: icon, owner_id: currentUser.id }]).select().single();
        if (sErr) return alert(sErr.message);
        await _supabase.from('server_members').insert([{ server_id: server.id, user_id: currentUser.id }]);
        await _supabase.from('channels').insert([{ server_id: server.id, name: 'general', is_lounge: false }]);
        location.reload();
    }
}

async function createLounge() {
    const name = prompt("Enter Lounge Name (e.g., Chill Chat):");
    if (!name || !currentServerID) return;
    const { error } = await _supabase.from('channels').insert([{ server_id: currentServerID, name: name, is_lounge: true }]);
    if (error) alert(error.message); else loadChannels(currentServerID);
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

async function saveServerSettings() {
    const modal = document.getElementById('server-settings-modal');
    const id = modal.getAttribute('data-current-id');
    const name = document.getElementById('set-server-name').value.trim();
    const icon = document.getElementById('set-server-icon').value.trim();
    await _supabase.from('servers').update({ name, icon }).eq('id', id);
    location.reload();
}

async function deleteServer() {
    const id = document.getElementById('server-settings-modal').getAttribute('data-current-id');
    if (!confirm("Delete this server permanently?")) return;
    await _supabase.from('servers').delete().eq('id', id);
    location.reload();
}

// ────────────────────────────────────────────────
// 3. NAVIGATION & VIEW
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
        header.innerHTML = `
            <span>Channels</span> 
            <div class="header-tools">
                <span class="tool-icon" onclick="createLounge()" title="Create Lounge">💬</span>
                <span id="server-settings-btn" class="tool-icon" style="display:none;" onclick="openServerSettings('${id}')">⚙️</span>
            </div>
        `;
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
        div.innerHTML = `<span style="opacity:0.5; margin-right:8px;">${ch.is_lounge ? '🔊' : '#'}</span>${ch.name}`;
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

// ────────────────────────────────────────────────
// 4. FRIEND SYSTEM (ID BASED)
// ────────────────────────────────────────────────

function renderFriendsUI() {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = `
        <div style="padding:20px;">
            <label style="font-size:11px; font-weight:bold; color:#7289da;">ADD BY ID</label>
            <input type="text" id="friend-id-in" class="input-box" placeholder="User ID..." style="width:100%; margin-top:10px;">
            <button class="aero-btn" onclick="sendFriendRequest()" style="width:100%; margin-top:10px; background:#43b581; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer;">Add Friend</button>
            <hr style="margin:20px 0; opacity:0.1;">
            <p style="font-size:11px; opacity:0.6;">Your ID:</p>
            <strong onclick="navigator.clipboard.writeText('${currentUser.id}'); alert('ID Copied!')" style="cursor:pointer; color:#fff; font-family:monospace; display:block; background:rgba(0,0,0,0.2); padding:5px;">${currentUser.id}</strong>
        </div>
    `;
}

async function sendFriendRequest() {
    const friendId = document.getElementById('friend-id-in').value.trim();
    if (!friendId || friendId === currentUser.id) return alert("Invalid ID.");
    const { error } = await _supabase.from('friends').insert([{ sender_id: currentUser.id, receiver_id: friendId, status: 'accepted' }]);
    if (error) alert("Error: User ID not found.");
    else { alert("Friend Added!"); setView('dm'); }
}

async function loadDMList() {
    const { data } = await _supabase.from('friends').select('*, sender:profiles!friends_sender_id_fkey(*), receiver:profiles!friends_receiver_id_fkey(*)').eq('status', 'accepted').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
    const content = document.getElementById('sidebar-content');
    data?.forEach(rel => {
        const f = rel.sender_id === currentUser.id ? rel.receiver : rel.sender;
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `<img src="${f.pfp}" class="pfp-img circle" style="width:24px; height:24px; margin-right:10px;"><span>${f.username}</span>`;
        div.onclick = () => {
            activeChatID = f.id; chatType = 'dm'; loadMessages();
            document.querySelectorAll('.friend-item').forEach(el => el.classList.remove('active-chat'));
            div.classList.add('active-chat');
        };
        content.appendChild(div);
    });
}

// ────────────────────────────────────────────────
// 5. CHAT ENGINE
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
    div.innerHTML = `
        <div class="pfp-container"><img src="${msg.pfp_static}" class="pfp-img circle"></div>
        <div class="msg-body">
            <span class="msg-meta">${msg.username_static}${isMe ? `<span class="del-btn" onclick="deleteMessage('${msg.id}')">×</span>` : ''}</span>
            <div class="msg-content">${msg.content}</div>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

async function deleteMessage(id) {
    if(!confirm("Delete?")) return;
    await _supabase.from('messages').delete().eq('id', id).eq('sender_id', currentUser.id);
    loadMessages();
}

// ────────────────────────────────────────────────
// 6. SYSTEM UTILS & REALTIME
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

async function saveProfile() {
    const newName = document.getElementById('edit-username').value;
    const newPfp = document.getElementById('edit-pfp').value;
    await _supabase.from('profiles').update({ username: newName, pfp: newPfp }).eq('id', currentUser.id);
    updateLocalUI(newName, newPfp);
    document.getElementById('profile-modal').style.display = 'none';
}

async function ensureGlobalGeneralChannel() { 
    const { data: existing } = await _supabase.from('channels').select('id').eq('server_id', GLOBAL_SERVER_ID).eq('name', 'general').maybeSingle(); 
    if (!existing) await _supabase.from('channels').insert({ server_id: GLOBAL_SERVER_ID, name: 'general', is_lounge: false }); 
}

function setupRealtime() {
    _supabase.channel('main').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => loadMessages()).subscribe();
}
