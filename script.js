const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = null;
let currentServerID = null;
let chatType = 'dm'; // 'dm' or 'server'
let isLoginMode = false;
let lastProfileUpdate = null;

const PROFILE_COOLDOWN_MINUTES = 20;

// ────────────────────────────────────────────────
// VIEW CONTROLLER
// ────────────────────────────────────────────────
function setView(view, id = null) {
    const content = document.getElementById('sidebar-content');
    const header = document.getElementById('sidebar-header');
    content.innerHTML = '';
    activeChatID = null;
    document.getElementById('chat-messages').innerHTML = '';

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
        document.querySelector(`.server-icon[data-server-id="${id}"]`)?.classList.add('active');
        loadChannels(id);
    }
}

// ────────────────────────────────────────────────
// CHAT & MESSAGES
// ────────────────────────────────────────────────
function getChatId(friendId) {
    // Alphabetical sort ensures both users share the same room ID
    return [currentUser.id, friendId].sort().join('_');
}

async function loadMessages() {
    if (!activeChatID) return;
    const container = document.getElementById('chat-messages');
    
    let query = _supabase.from('messages').select('*').order('created_at', { ascending: true });
    
    if (chatType === 'server') {
        query = query.eq('channel_id', activeChatID);
    } else {
        query = query.eq('chat_id', getChatId(activeChatID));
    }

    const { data } = await query;
    container.innerHTML = '';
    data?.forEach(msg => appendMessage(msg));
}

function appendMessage(msg) {
    const container = document.getElementById('chat-messages');
    const isMe = msg.sender_id === currentUser.id;
    
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isMe ? 'own' : ''}`;
    
    bubble.innerHTML = `
        <img src="${msg.pfp_static}" class="pfp-img" onclick="showProfile('${msg.sender_id}')">
        <div class="msg-body">
            <div class="msg-header">
                <span class="username">${msg.username_static}</span>
            </div>
            <div class="msg-content">${msg.content}</div>
        </div>
    `;
    container.appendChild(bubble);
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
        pfp_static: document.getElementById('my-pfp').src
    };

    if (chatType === 'server') msgObj.channel_id = activeChatID;
    else msgObj.chat_id = getChatId(activeChatID);

    const { error } = await _supabase.from('messages').insert([msgObj]);
    if (!error) input.value = '';
}

// ────────────────────────────────────────────────
// PROFILE MANAGEMENT
// ────────────────────────────────────────────────
async function showProfile(userId) {
    const { data: prof } = await _supabase.from('profiles').select('*').eq('id', userId).single();
    if (!prof) return;

    const isOwn = userId === currentUser.id;
    document.getElementById('profile-title').innerText = isOwn ? "Your Profile" : `${prof.username}'s Profile`;
    document.getElementById('profile-pfp-large').src = prof.pfp;
    document.getElementById('profile-username').value = prof.username;
    
    document.getElementById('edit-profile-section').style.display = isOwn ? 'block' : 'none';
    if (isOwn) {
        document.getElementById('edit-username').value = prof.username;
        document.getElementById('edit-pfp-url').value = prof.pfp;
    }
    
    document.getElementById('profile-modal').style.display = 'flex';
}

async function saveProfileChanges() {
    const now = Date.now();
    if (lastProfileUpdate) {
        const diff = (now - lastProfileUpdate) / 1000 / 60;
        if (diff < PROFILE_COOLDOWN_MINUTES) {
            return alert(`Aero Security: Wait ${Math.ceil(PROFILE_COOLDOWN_MINUTES - diff)} more mins.`);
        }
    }

    const newName = document.getElementById('edit-username').value;
    const newPfp = document.getElementById('edit-pfp-url').value;

    const { error } = await _supabase.from('profiles')
        .update({ username: newName, pfp: newPfp })
        .eq('id', currentUser.id);

    if (!error) {
        lastProfileUpdate = now;
        location.reload();
    }
}

function closeProfileModal() {
    document.getElementById('profile-modal').style.display = 'none';
}

// ────────────────────────────────────────────────
// SERVERS & FRIENDS LISTS
// ────────────────────────────────────────────────
async function loadDMList() {
    const { data } = await _supabase.from('friends')
        .select('*, sender:profiles!friends_sender_id_fkey(id, username, pfp), receiver:profiles!friends_receiver_id_fkey(id, username, pfp)')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

    const content = document.getElementById('sidebar-content');
    data?.forEach(rel => {
        const friend = rel.sender_id === currentUser.id ? rel.receiver : rel.sender;
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.onclick = () => { 
            activeChatID = friend.id; 
            chatType = 'dm'; 
            loadMessages(); 
            document.querySelectorAll('.friend-item').forEach(i => i.classList.remove('active-chat'));
            div.classList.add('active-chat');
        };
        div.innerHTML = `<img src="${friend.pfp}" class="pfp-img"> <span>${friend.username}</span>`;
        content.appendChild(div);
    });
}

async function loadChannels(serverId) {
    const { data } = await _supabase.from('channels').eq('server_id', serverId);
    const content = document.getElementById('sidebar-content');
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

async function openServerSettings(serverId) {
    const { data: server } = await _supabase.from('servers').select('*').eq('id', serverId).single();
    if (server.owner_id === currentUser.id) {
        if (confirm("Delete this server permanently?")) {
            await _supabase.from('servers').delete().eq('id', serverId);
            location.reload();
        }
    } else {
        if (confirm("Leave this server?")) {
            await _supabase.from('server_members').delete().eq('server_id', serverId).eq('user_id', currentUser.id);
            location.reload();
        }
    }
}

// ────────────────────────────────────────────────
// INITIALIZATION
// ────────────────────────────────────────────────
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
        
        // Realtime
        _supabase.channel('messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const msg = payload.new;
            if (chatType === 'server' && msg.channel_id === activeChatID) appendMessage(msg);
            if (chatType === 'dm' && msg.chat_id === getChatId(activeChatID)) appendMessage(msg);
        }).subscribe();
        
        setView('dm');
    }
};
