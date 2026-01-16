const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co'; 
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = null;
let currentServerID = null;
let chatType = 'dm';
let isLoginMode = false;

// --- VIEW CONTROLLER ---
function setView(view, id = null) {
    const content = document.getElementById('sidebar-content');
    const header = document.getElementById('sidebar-header');
    content.innerHTML = '';
    activeChatID = null;
    
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
        header.innerHTML = `
            <span>Channels</span>
            <span class="settings-gear" onclick="openServerSettings('${id}')">⚙️</span>
        `;
        loadChannels(id);
    }
}

// --- FRIEND REQUEST SYSTEM (FIXED) ---
async function loadPendingRequests() {
    const { data, error } = await _supabase.from('friends')
        .select('id, sender:profiles!friends_sender_id_fkey(username, pfp)')
        .eq('receiver_id', currentUser.id)
        .eq('status', 'pending');
    
    const list = document.getElementById('pending-list');
    list.innerHTML = '';

    data?.forEach(req => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.style.justifyContent = 'space-between';
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${req.sender.pfp}" class="pfp-img" style="width:24px; height:24px;">
                <span>${req.sender.username}</span>
            </div>
            <div style="display:flex; gap:5px;">
                <button onclick="respondFriend(${req.id}, 'accepted')" class="mini-btn">✔</button>
                <button onclick="respondFriend(${req.id}, 'denied')" class="mini-btn" style="color:red">✖</button>
            </div>
        `;
        list.appendChild(div);
    });
}

// --- SERVER SETTINGS & DELETE ---
async function openServerSettings(serverId) {
    const { data: server } = await _supabase.from('servers').select('*').eq('id', serverId).single();
    
    if (server.owner_id === currentUser.id) {
        // OWNER OPTIONS: Delete
        const choice = confirm(`Server: ${server.name}\n\nYou are the Owner. Do you want to DELETE this server?`);
        if (choice) {
            const confirmName = prompt(`Type "${server.name}" to confirm deletion:`);
            if (confirmName === server.name) {
                await _supabase.from('servers').delete().eq('id', serverId);
                alert("Server deleted.");
                location.reload();
            }
        }
    } else {
        // MEMBER OPTIONS: Leave
        const choice = confirm(`Server: ${server.name}\n\nDo you want to LEAVE this server?`);
        if (choice) {
            const { error } = await _supabase.from('server_members')
                .delete()
                .eq('server_id', serverId)
                .eq('user_id', currentUser.id);
            
            if (!error) {
                alert("You left the server.");
                location.reload();
            } else {
                alert("Error leaving server.");
            }
        }
    }
}


// --- CORE FUNCTIONALITY (Updated) ---
async function loadChannels(serverId) {
    const { data } = await _supabase.from('channels').eq('server_id', serverId);
    const content = document.getElementById('sidebar-content');
    
    const inviteBtn = document.createElement('button');
    inviteBtn.className = 'aero-btn';
    inviteBtn.style.margin = "10px";
    inviteBtn.innerText = "+ Invite People";
    inviteBtn.onclick = () => inviteToServer(serverId);
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

// --- ALL OTHER FUNCTIONS (KEEP THESE THE SAME AS PREVIOUS) ---
async function handleAuth() {
    const email = document.getElementById('email-in').value;
    const password = document.getElementById('pass-in').value;
    const username = document.getElementById('username-in').value;
    if (!isLoginMode) {
        const { data: existing } = await _supabase.from('profiles').eq('username', username).single();
        if (existing) return alert("Username taken!");
        const { data, error } = await _supabase.auth.signUp({ email, password });
        if (error) return alert(error.message);
        await _supabase.from('profiles').upsert([{ id: data.user.id, username, pfp: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}` }]);
        alert("Success! Log in now.");
        toggleAuthMode();
    } else {
        const { error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) alert(error.message);
        else location.reload();
    }
}

function renderFriendsUI() {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = `
        <div style="padding: 15px;">
            <input type="text" id="friend-search" placeholder="Enter Username..." class="input-box" style="background:white; margin-bottom:5px;">
            <div id="friend-msg" style="font-size:11px; margin-bottom:10px; font-weight:bold;"></div>
            <button class="aero-btn" onclick="sendFriendRequest()">Send Request</button>
        </div>
        <div class="section-label">Pending Requests</div>
        <div id="pending-list"></div>
    `;
    loadPendingRequests();
}

async function sendFriendRequest() {
    const name = document.getElementById('friend-search').value;
    const msgEl = document.getElementById('friend-msg');
    const { data: target } = await _supabase.from('profiles').eq('username', name).single();
    if (!target) { msgEl.innerText = "User not found"; msgEl.style.color="red"; return; }
    const { error } = await _supabase.from('friends').insert([{ sender_id: currentUser.id, receiver_id: target.id, status: 'pending' }]);
    if (error) { msgEl.innerText = "Already sent!"; msgEl.style.color="orange"; }
    else { msgEl.innerText = "Request sent!"; msgEl.style.color="green"; }
}

async function respondFriend(id, status) {
    if (status === 'denied') await _supabase.from('friends').delete().eq('id', id);
    else await _supabase.from('friends').update({ status }).eq('id', id);
    setView('friends');
}

async function loadDMList() {
    const { data } = await _supabase.from('friends').select('*, sender:profiles!friends_sender_id_fkey(id, username, pfp), receiver:profiles!friends_receiver_id_fkey(id, username, pfp)').eq('status', 'accepted').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
    const content = document.getElementById('sidebar-content');
    data?.forEach(rel => {
        const friend = rel.sender_id === currentUser.id ? rel.receiver : rel.sender;
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.onclick = () => { activeChatID = friend.id; chatType = 'dm'; loadMessages(); };
        div.innerHTML = `<img src="${friend.pfp}" class="pfp-img" style="width:24px"> <span>${friend.username}</span>`;
        content.appendChild(div);
    });
}

async function createEmptyServer() {
    const name = document.getElementById('server-name-in').value;
    const icon = document.getElementById('server-icon-in').value || '📁';
    const { data: server } = await _supabase.from('servers').insert([{ name, icon, owner_id: currentUser.id }]).select().single();
    await _supabase.from('server_members').insert([{ server_id: server.id, user_id: currentUser.id }]);
    await _supabase.from('channels').insert([{ server_id: server.id, name: 'general' }]);
    location.reload();
}

async function loadServers() {
    const { data: memberships } = await _supabase.from('server_members').select('server_id').eq('user_id', currentUser.id);
    const serverIds = memberships.map(m => m.server_id);
    const { data: servers } = await _supabase.from('servers').in('id', serverIds);
    const list = document.getElementById('server-list');
    servers?.forEach(s => {
        const div = document.createElement('div');
        div.className = 'server-icon';
        div.innerText = s.icon.length < 4 ? s.icon : '';
        if(s.icon.length >= 4) div.style.backgroundImage = `url(${s.icon})`;
        div.onclick = () => setView('server', s.id);
        list.appendChild(div);
    });
}

async function sendMessage() {
    const input = document.getElementById('chat-in');
    if (!input.value.trim() || !activeChatID) return;
    const msgObj = { sender_id: currentUser.id, content: input.value, username_static: document.getElementById('my-name').innerText, pfp_static: document.getElementById('my-pfp').src };
    if (chatType === 'server') msgObj.channel_id = activeChatID;
    else msgObj.chat_id = [currentUser.id, activeChatID].sort().join('_');
    await _supabase.from('messages').insert([msgObj]);
    input.value = '';
}

async function loadMessages() {
    if (!activeChatID) return;
    let query = _supabase.from('messages').select('*').order('created_at', { ascending: true });
    if (chatType === 'server') query = query.eq('channel_id', activeChatID);
    else query = query.eq('chat_id', [currentUser.id, activeChatID].sort().join('_'));
    const { data } = await query;
    document.getElementById('chat-messages').innerHTML = data?.map(msg => `<div class="message-bubble"><img src="${msg.pfp_static}" class="pfp-img"><div><div style="font-weight:bold; font-size:12px; color:#0078d7;">${msg.username_static}</div><div>${msg.content}</div></div></div>`).join('') || '';
    document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('signup-fields').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('auth-main-btn').innerText = isLoginMode ? 'Login' : 'Sign Up';
}

window.onload = async () => {
    const { data: { user } } = await _supabase.auth.getUser();
    if (user) {
        currentUser = user;
        document.getElementById('auth-overlay').style.display = 'none';
        const { data: prof } = await _supabase.from('profiles').select('*').eq('id', user.id).single();
        if (prof) {
            document.getElementById('my-name').innerText = prof.username;
            document.getElementById('my-pfp').src = prof.pfp;
        }
        loadServers();
        _supabase.channel('messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, loadMessages).subscribe();
        setView('dm');
    }
};
