/**
 * AeroSocial Pro v3.4 - Ultimate Stable Build
 * Fixes: Circle PFPs, Scaling, Channel Logic, Message Deletion
 */

const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

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
// 2. VIEW NAVIGATION
// ────────────────────────────────────────────────

function setView(view, id = null) {
    const sidebarContent = document.getElementById('sidebar-content');
    const memberSidebar = document.getElementById('member-list-sidebar');
    const header = document.getElementById('sidebar-header');
    
    sidebarContent.innerHTML = ''; 
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));

    if (view === 'dm') {
        currentServerID = null;
        memberSidebar.style.display = 'none';
        header.innerHTML = `Direct Messages`;
        loadDMList();
    } else if (view === 'server') {
        currentServerID = id;
        // On mobile, member sidebar stays hidden unless specifically toggled
        memberSidebar.style.display = window.innerWidth > 768 ? 'flex' : 'none';
        header.innerHTML = `Channels`;
        
        const icon = document.querySelector(`.server-icon[data-id="${id}"]`);
        if(icon) icon.classList.add('active');
        
        loadChannels(id, true);
        loadServerMembers(id);
    }
}

// ────────────────────────────────────────────────
// 3. CHANNEL & SERVER LOGIC
// ────────────────────────────────────────────────

async function createChannel() {
    if (!currentServerID || currentServerID === GLOBAL_SERVER_ID) return;
    const name = prompt("New channel name:");
    if (!name) return;

    await _supabase.from('channels').insert([{ 
        server_id: currentServerID, 
        name: name.toLowerCase().replace(/\s+/g, '-') 
    }]);
    loadChannels(currentServerID);
}

async function loadChannels(serverId, autoSelect = false) {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = '';

    if (serverId !== GLOBAL_SERVER_ID) {
        const addBtn = document.createElement('div');
        addBtn.className = 'friend-item';
        addBtn.style.color = 'var(--accent)';
        addBtn.innerHTML = `<b>+ Create Channel</b>`;
        addBtn.onclick = createChannel;
        content.appendChild(addBtn);
    }

    const { data } = await _supabase.from('channels').select('*').eq('server_id', serverId).order('created_at', {ascending: true});
    data?.forEach((ch, i) => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerText = `# ${ch.name}`;
        div.onclick = () => {
            activeChatID = ch.id; chatType = 'server'; loadMessages();
            document.querySelectorAll('.friend-item').forEach(el => el.classList.remove('active-chat'));
            div.classList.add('active-chat');
        };
        content.appendChild(div);
        if (autoSelect && i === 0) div.click();
    });
}

// ────────────────────────────────────────────────
// 4. CHAT SYSTEM
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
        <div class="pfp-container">
            <img src="${msg.pfp_static}" class="pfp-img circle">
        </div>
        <div class="msg-body">
            <span class="msg-meta" style="${isMe ? 'text-align:right' : ''}">
                ${msg.username_static} ${isMe ? `<span class="del-btn" onclick="deleteMessage('${msg.id}')">×</span>` : ''}
            </span>
            <div class="msg-content">${msg.content}</div>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

async function deleteMessage(id) {
    await _supabase.from('messages').delete().eq('id', id).eq('sender_id', currentUser.id);
    loadMessages();
}

// ────────────────────────────────────────────────
// 5. SERVER & MEMBER DATA
// ────────────────────────────────────────────────

async function loadServers() {
    const list = document.getElementById('server-list');
    list.innerHTML = `<div class="server-icon" onclick="setView('server', '${GLOBAL_SERVER_ID}')">🌎</div>`;
    
    const { data } = await _supabase.from('server_members').select('servers(*)').eq('user_id', currentUser.id);
    data?.forEach(m => {
        if (!m.servers || m.servers.id === GLOBAL_SERVER_ID) return;
        const div = document.createElement('div');
        div.className = 'server-icon';
        div.dataset.id = m.servers.id;
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
        div.innerHTML = `
            <div class="pfp-container" style="width:24px; height:24px;">
                <img src="${u.pfp}" class="pfp-img circle">
            </div>
            <span>${u.username}</span>
        `;
        container.appendChild(div);
    });
}

async function loadDMList() {
    const { data } = await _supabase.from('friends').select('*, sender:profiles!friends_sender_id_fkey(*), receiver:profiles!friends_receiver_id_fkey(*)')
        .eq('status', 'accepted').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
    
    data?.forEach(rel => {
        const f = rel.sender_id === currentUser.id ? rel.receiver : rel.sender;
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `
            <div class="pfp-container" style="width:24px; height:24px; margin-right:10px;">
                <img src="${f.pfp}" class="pfp-img circle">
            </div>
            <span>${f.username}</span>
        `;
        div.onclick = () => {
            activeChatID = f.id; chatType = 'dm'; loadMessages();
            document.querySelectorAll('.friend-item').forEach(el => el.classList.remove('active-chat'));
            div.classList.add('active-chat');
        };
        document.getElementById('sidebar-content').appendChild(div);
    });
}

function setupRealtime() {
    _supabase.channel('messages-db').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        loadMessages();
    }).subscribe();
}
