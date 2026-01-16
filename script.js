const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co'; 
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = null;
let chatType = 'dm';
let isLoginMode = false;

// --- VIEW CONTROLLER ---
function setView(view, id = null) {
    const content = document.getElementById('sidebar-content');
    const header = document.getElementById('sidebar-header');
    content.innerHTML = '';
    
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));

    if (view === 'dm') {
        document.getElementById('nav-dm').classList.add('active');
        header.innerText = "Direct Messages";
        loadDMList();
    } else if (view === 'friends') {
        document.getElementById('nav-friends').classList.add('active');
        header.innerText = "Friends Management";
        renderFriendsUI();
    } else if (view === 'server') {
        header.innerText = "Channels";
        loadChannels(id);
    }
}

// --- FRIEND SYSTEM (With Colored Feedback) ---
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
    if (!name) return;

    const { data: target } = await _supabase.from('profiles').eq('username', name).single();

    if (!target) {
        msgEl.innerText = "User does not exist!";
        msgEl.style.color = "#ff4757"; // Red
        return;
    }

    const { error } = await _supabase.from('friends').insert([{ 
        sender_id: currentUser.id, 
        receiver_id: target.id, 
        status: 'pending' 
    }]);

    if (error) {
        msgEl.innerText = "Request already pending!";
        msgEl.style.color = "#ffa502"; // Orange
    } else {
        msgEl.innerText = "Friend request sent!";
        msgEl.style.color = "#2ed573"; // Green
    }
}

// --- SERVER & INVITE SYSTEM ---
async function createEmptyServer() {
    const name = document.getElementById('server-name-in').value;
    const icon = document.getElementById('server-icon-in').value || '📁';
    if(!name) return alert("Please enter a name");

    const { data: server } = await _supabase.from('servers').insert([{ name, icon, owner_id: currentUser.id }]).select().single();
    
    // Add creator as member
    await _supabase.from('server_members').insert([{ server_id: server.id, user_id: currentUser.id }]);
    
    // Auto-create General channel
    await _supabase.from('channels').insert([{ server_id: server.id, name: 'general' }]);
    
    location.reload();
}

async function inviteToServer(serverId) {
    const username = prompt("Enter username to invite:");
    if (!username) return;

    const { data: user } = await _supabase.from('profiles').eq('username', username).single();
    if (!user) return alert("User not found");

    const { error } = await _supabase.from('server_members').insert([{ server_id: serverId, user_id: user.id }]);
    if (error) alert("User is already in this server!");
    else alert(`Invited ${username}!`);
}

async function loadServers() {
    // Only load servers the user is a member of
    const { data: memberships } = await _supabase.from('server_members').select('server_id').eq('user_id', currentUser.id);
    const serverIds = memberships.map(m => m.server_id);

    const { data: servers } = await _supabase.from('servers').in('id', serverIds);
    const list = document.getElementById('server-list');
    
    servers?.forEach(s => {
        const div = document.createElement('div');
        div.className = 'server-icon';
        div.innerText = s.icon.length < 4 ? s.icon : '';
        if(s.icon.length > 4) div.style.backgroundImage = `url(${s.icon})`;
        div.onclick = () => setView('server', s.id);
        list.appendChild(div);
    });
}

async function loadChannels(serverId) {
    const { data } = await _supabase.from('channels').eq('server_id', serverId);
    const content = document.getElementById('sidebar-content');
    
    // Invite Button at top
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
        div.onclick = () => { activeChatID = ch.id; chatType = 'server'; loadMessages(); };
        content.appendChild(div);
    });
}

// --- AUTH WITH USERNAME CHECK ---
async function handleAuth() {
    const email = document.getElementById('email-in').value;
    const password = document.getElementById('pass-in').value;
    const authMsg = document.getElementById('auth-msg') || document.createElement('div');
    authMsg.id = "auth-msg";
    document.getElementById('auth-form').prepend(authMsg);

    if (isLoginMode) {
        const { error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) {
            authMsg.innerText = error.message;
            authMsg.style.color = "red";
        } else location.reload();
    } else {
        const username = document.getElementById('username-in').value;
        
        // CHECK IF USERNAME IS TAKEN
        const { data: existing } = await _supabase.from('profiles').eq('username', username).single();
        if (existing) {
            authMsg.innerText = "This username is already taken!";
            authMsg.style.color = "red";
            return;
        }

        const { data, error } = await _supabase.auth.signUp({ email, password });
        if (error) return alert(error.message);
        
        await _supabase.from('profiles').upsert([{ id: data.user.id, username, pfp: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}` }]);
        alert("Success! Log in now.");
        toggleAuthMode();
    }
}

// --- REST OF CORE FUNCTIONS (PREVIOUS CODE) ---
async function loadDMList() {
    const { data } = await _supabase.from('friends').select('*, sender:profiles!friends_sender_id_fkey(id, username, pfp), receiver:profiles!friends_receiver_id_fkey(id, username, pfp)').eq('status', 'accepted').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
    const content = document.getElementById('sidebar-content');
    data?.forEach(rel => {
        const friend = rel.sender_id === currentUser.id ? rel.receiver : rel.sender;
        const div = document.createElement('div');
        div.className = `friend-item ${activeChatID === friend.id ? 'active-chat' : ''}`;
        div.onclick = () => { activeChatID = friend.id; chatType = 'dm'; loadMessages(); };
        div.innerHTML = `<img src="${friend.pfp}" class="pfp-img" style="width:24px"> <span>${friend.username}</span>`;
        content.appendChild(div);
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
