/**
 * AeroSocial Pro v4.0 - Ultimate Integrated Edition
 * Features: Auth, Real-time Chat, Server Logic, Friend System, Profile Editing, Owner Settings
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
        await ensureGlobalGeneralChannel(); // Ensure global general exists
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
    
    if (!email || !password) return alert("Please fill in all fields.");

    if (isLoginMode) {
        const { error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) return alert(error.message);
        location.reload();
    } else {
        if (!username) return alert("Username required for signup.");
        const { data, error } = await _supabase.auth.signUp({ email, password });
        if (error) return alert(error.message);
        
        if (data.user) {
            await _supabase.from('profiles').insert([{ 
                id: data.user.id, 
                username, 
                pfp: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}` 
            }]);
            alert("Account created! Logging in...");
            location.reload();
        }
    }
}

async function signOut() {
    await _supabase.auth.signOut();
    location.reload();
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('signup-fields').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('auth-main-btn').innerText = isLoginMode ? 'Login' : 'Sign Up';
}

// ────────────────────────────────────────────────
// 2. FRIEND SYSTEM & PROFILE
// ────────────────────────────────────────────────

async function sendFriendRequest() {
    const targetUsername = prompt("Enter the username of the person you want to add:");
    if (!targetUsername) return;

    const { data: targetUser, error } = await _supabase
        .from('profiles')
        .select('id')
        .eq('username', targetUsername)
        .single();

    if (error || !targetUser) return alert("User not found.");
    if (targetUser.id === currentUser.id) return alert("You cannot add yourself.");

    const { error: reqError } = await _supabase.from('friends').insert([
        { sender_id: currentUser.id, receiver_id: targetUser.id, status: 'pending' }
    ]);

    if (reqError) alert("Friend request already exists or failed.");
    else alert("Friend request sent!");
}

async function loadFriendRequests() {
    const { data: requests } = await _supabase
        .from('friends')
        .select('*, sender:profiles!friends_sender_id_fkey(*)')
        .eq('receiver_id', currentUser.id)
        .eq('status', 'pending');

    const container = document.getElementById('sidebar-content');
    if (requests && requests.length > 0) {
        const title = document.createElement('div');
        title.style = "padding: 10px; font-size: 11px; color: #888; font-weight: bold;";
        title.innerText = "PENDING REQUESTS";
        container.appendChild(title);

        requests.forEach(req => {
            const div = document.createElement('div');
            div.className = 'friend-item';
            div.style = "display: flex; justify-content: space-between; align-items: center;";
            div.innerHTML = `
                <span>${req.sender.username}</span>
                <div>
                    <button onclick="handleFriendRequest('${req.id}', 'accepted')" style="color: #43b581; background: none; border: none; cursor: pointer;">✔</button>
                    <button onclick="handleFriendRequest('${req.id}', 'declined')" style="color: #f04747; background: none; border: none; cursor: pointer; margin-left: 5px;">✘</button>
                </div>
            `;
            container.appendChild(div);
        });
    }
}

async function handleFriendRequest(requestId, status) {
    if (status === 'accepted') {
        await _supabase.from('friends').update({ status: 'accepted' }).eq('id', requestId);
    } else {
        await _supabase.from('friends').delete().eq('id', requestId);
    }
    setView('dm');
}

function openProfile() {
    const name = document.getElementById('my-name').textContent;
    const pfp = document.getElementById('my-pfp').src;
    document.getElementById('edit-username').value = name;
    document.getElementById('edit-pfp').value = pfp;
    document.getElementById('profile-modal').style.display = 'flex';
}

async function saveProfile() {
    const newName = document.getElementById('edit-username').value.trim();
    const newPfp = document.getElementById('edit-pfp').value.trim();
    if(!newName) return alert("Username cannot be empty");

    const { error } = await _supabase.from('profiles').update({ 
        username: newName, 
        pfp: newPfp 
    }).eq('id', currentUser.id);

    if(error) return alert("Error updating profile: " + error.message);
    updateLocalUI(newName, newPfp);
    document.getElementById('profile-modal').style.display = 'none';
}

// ────────────────────────────────────────────────
// 3. SERVER & CHANNEL LOGIC (FIXED)
// ────────────────────────────────────────────────

async function checkServerOwnership(serverId) {
    const settingsBtn = document.getElementById('server-settings-btn');
    if (!settingsBtn) return;
    if (serverId === GLOBAL_SERVER_ID) { settingsBtn.style.display = 'none'; return; }

    const { data: server } = await _supabase.from('servers').select('owner_id').eq('id', serverId).single();
    settingsBtn.style.display = (server && server.owner_id === currentUser.id) ? 'block' : 'none';
}

async function loadChannels(serverId, autoSelect = false) {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = '';
    const { data } = await _supabase.from('channels').select('*').eq('server_id', serverId).order('created_at', {ascending: true});
    
    data?.forEach((ch, i) => {
        const div = document.createElement('div');
        div.className = 'friend-item channel-btn';
        div.innerHTML = `<span style="opacity: 0.5; margin-right: 5px;">#</span>${ch.name}`;
        div.onclick = () => {
            activeChatID = ch.id; 
            chatType = 'server'; 
            loadMessages();
            document.querySelectorAll('.friend-item').forEach(el => el.classList.remove('active-chat'));
            div.classList.add('active-chat');
        };
        content.appendChild(div);
        if (autoSelect && i === 0) div.click();
    });
}

async function createOrJoinServer() {
    const name = document.getElementById('server-name-in').value.trim();
    if (!name) return;
    if (name.includes('-') && name.length > 20) {
        await _supabase.from('server_members').insert([{ server_id: name, user_id: currentUser.id }]);
    } else {
        const { data: server } = await _supabase.from('servers').insert([{ name: name, icon: '🌐', owner_id: currentUser.id }]).select().single();
        await _supabase.from('server_members').insert([{ server_id: server.id, user_id: currentUser.id }]);
        await _supabase.from('channels').insert([{ server_id: server.id, name: 'general' }]);
    }
    location.reload();
}

// ────────────────────────────────────────────────
// 4. CHAT ENGINE
// ────────────────────────────────────────────────

async function loadMessages() {
    if (!activeChatID) return;
    const container = document.getElementById('chat-messages');
    let query = _supabase.from('messages').select('*').order('created_at', { ascending: true });
    
    if (chatType === 'server') query = query.eq('channel_id', activeChatID);
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

    const myName = document.getElementById('my-name').textContent;
    const myPfp = document.getElementById('my-pfp').src;

    const msgObj = {
        sender_id: currentUser.id,
        content: text,
        username_static: myName,
        pfp_static: myPfp,
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
        <div class="pfp-container"><img src="${msg.pfp_static}" class="pfp-img circle"></div>
        <div class="msg-body">
            <span class="msg-meta" style="${isMe ? 'text-align:right' : ''}">
                ${msg.username_static} 
                ${isMe ? `<span class="del-btn" onclick="deleteMessage('${msg.id}')">×</span>` : ''}
            </span>
            <div class="msg-content">${msg.content}</div>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

async function deleteMessage(id) {
    if(!confirm("Delete this message?")) return;
    await _supabase.from('messages').delete().eq('id', id).eq('sender_id', currentUser.id);
    loadMessages();
}

// ────────────────────────────────────────────────
// 5. VIEW & NAVIGATION
// ────────────────────────────────────────────────

function setView(view, id = null) {
    currentServerID = id;
    const sidebarRight = document.getElementById('member-list-sidebar');
    const header = document.getElementById('sidebar-header');
    const sidebarContent = document.getElementById('sidebar-content');
    
    sidebarContent.innerHTML = ''; 
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));

    if (view === 'dm') {
        sidebarRight.style.display = 'none';
        header.innerHTML = `Direct Messages <button onclick="sendFriendRequest()" style="background:none; border:none; color:white; cursor:pointer; font-size:18px; float:right;">+</button>`;
        loadDMList();
        loadFriendRequests();
        document.querySelector('.server-icon[onclick*="dm"]')?.classList.add('active');
    } else {
        sidebarRight.style.display = 'flex';
        header.innerHTML = `Channels`;
        const activeIcon = document.querySelector(`.server-icon[onclick*="${id}"]`);
        if(activeIcon) activeIcon.classList.add('active');
        loadChannels(id, true);
        loadServerMembers(id);
        checkServerOwnership(id);
    }
}

async function loadServers() {
    const list = document.getElementById('server-list');
    list.innerHTML = `<div class="server-icon" onclick="setView('server', '${GLOBAL_SERVER_ID}')">🌎</div>`;
    const { data } = await _supabase.from('server_members').select('servers(*)').eq('user_id', currentUser.id);
    data?.forEach(m => {
        if (!m.servers || m.servers.id === GLOBAL_SERVER_ID) return;
        const div = document.createElement('div');
        div.className = 'server-icon';
        div.textContent = m.servers.icon || '🌐';
        div.onclick = () => setView('server', m.servers.id);
        list.appendChild(div);
    });
}

async function loadServerMembers(serverId) {
    const container = document.getElementById('member-list-container');
    container.innerHTML = '';
    const { data } = (serverId === GLOBAL_SERVER_ID) 
        ? await _supabase.from('profiles').select('*').limit(30)
        : await _supabase.from('server_members').select('profiles(*)').eq('server_id', serverId);
    
    const users = (serverId === GLOBAL_SERVER_ID) ? data : data?.map(m => m.profiles);
    users?.forEach(u => {
        const div = document.createElement('div');
        div.className = 'member-item';
        div.innerHTML = `<div class="pfp-container" style="width:24px; height:24px;"><img src="${u.pfp}" class="pfp-img circle"></div><span>${u.username}</span>`;
        container.appendChild(div);
    });
}

async function loadDMList() {
    const { data } = await _supabase.from('friends')
        .select('*, sender:profiles!friends_sender_id_fkey(*), receiver:profiles!friends_receiver_id_fkey(*)')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
    
    data?.forEach(rel => {
        const f = rel.sender_id === currentUser.id ? rel.receiver : rel.sender;
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `<div class="pfp-container" style="width:24px; height:24px; margin-right:10px;"><img src="${f.pfp}" class="pfp-img circle"></div><span>${f.username}</span>`;
        div.onclick = () => {
            activeChatID = f.id; 
            chatType = 'dm'; 
            loadMessages();
            document.querySelectorAll('.friend-item').forEach(el => el.classList.remove('active-chat'));
            div.classList.add('active-chat');
        };
        document.getElementById('sidebar-content').appendChild(div);
    });
}

async function ensureGlobalGeneralChannel() { 
    const { data: existing } = await _supabase.from('channels').select('id').eq('server_id', GLOBAL_SERVER_ID).eq('name', 'general').maybeSingle(); 
    if (!existing) await _supabase.from('channels').insert({ server_id: GLOBAL_SERVER_ID, name: 'general' }); 
}

function setupRealtime() {
    _supabase.channel('public-chat')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => loadMessages())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, () => {
             if (chatType === 'dm') setView('dm');
        })
        .subscribe();
}
