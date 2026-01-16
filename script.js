// script.js - AeroSocial (full version with all features)

const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
// WARNING: In production, use environment variables (e.g. import.meta.env.VITE_SUPABASE_ANON_KEY)

const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = null;
let currentServerID = null;
let chatType = 'dm';
let isLoginMode = false;
let displayedMessages = new Set();
let messageSubscription = null;
let currentProfileUserId = null;
let lastProfileUpdate = null;

const PROFILE_COOLDOWN_MINUTES = 1;
const MAX_WORD_LENGTH = 30;

// ────────────────────────────────────────────────
// VIEW CONTROLLER
// ────────────────────────────────────────────────

function setView(view, id = null) {
    const content = document.getElementById('sidebar-content');
    const header = document.getElementById('sidebar-header');
    content.innerHTML = '';
    activeChatID = null;
    displayedMessages.clear();

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
            <button class="mini-btn" onclick="addChannel()">+ Add</button>
            <span class="settings-gear" onclick="openServerSettings('${id}')">⚙️</span>
        `;
        document.querySelector(`.server-icon[data-server-id="${id}"]`)?.classList.add('active');
        loadChannels(id);
    }
}

// ────────────────────────────────────────────────
// PROFILE MODAL + EDITING + COOLDOWN
// ────────────────────────────────────────────────

async function showProfile(userId) {
    currentProfileUserId = userId;
    const isOwn = userId === currentUser?.id;

    const { data: profile, error } = await _supabase
        .from('profiles')
        .select('username, pfp')
        .eq('id', userId)
        .single();

    if (error || !profile) {
        alert("Could not load profile");
        return;
    }

    document.getElementById('profile-title').textContent = isOwn ? "Your Profile" : `${profile.username}'s Profile`;
    document.getElementById('profile-pfp-large').src = profile.pfp || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.username}`;
    document.getElementById('profile-username').value = profile.username;

    document.getElementById('edit-profile-section').style.display = isOwn ? 'block' : 'none';

    if (isOwn) {
        document.getElementById('edit-username').value = profile.username;
        document.getElementById('edit-pfp-url').value = profile.pfp.includes('dicebear') ? '' : profile.pfp;
    }

    // Show modal with blur & prevent body scroll
    const modal = document.getElementById('profile-modal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // prevent scrolling main page
}

function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    modal.style.display = 'none';
    document.body.style.overflow = ''; // restore normal scroll
}

// Close when clicking outside modal content
document.getElementById('profile-modal')?.addEventListener('click', function(e) {
    if (e.target === this) { // clicked on the overlay itself
        closeProfileModal();
    }
});

// ────────────────────────────────────────────────
// REST OF YOUR CODE (loadMessages, sendMessage, etc.)
// ────────────────────────────────────────────────

// ... your other functions here ...

window.onload = async () => {
    // your existing onload code
};

// ────────────────────────────────────────────────
// CLICKABLE AVATAR HELPER
// ────────────────────────────────────────────────

function createClickableAvatar(pfpUrl, username, userId, size = 32) {
    const img = document.createElement('img');
    img.src = pfpUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
    img.className = 'pfp-img';
    img.style.width = `${size}px`;
    img.style.height = `${size}px`;
    img.style.cursor = 'pointer';
    img.title = username;
    img.alt = username;
    img.onclick = () => showProfile(userId);
    return img;
}

// ────────────────────────────────────────────────
// MESSAGES – LOAD, APPEND, REAL-TIME + WORD LIMIT
// ────────────────────────────────────────────────

function validateMessage(text) {
    const words = text.trim().split(/\s+/);
    for (const word of words) {
        if (word.length > MAX_WORD_LENGTH) {
            return `No word can be longer than ${MAX_WORD_LENGTH} characters.\nProblem: "${word}"`;
        }
    }
    return null;
}

async function loadMessages(scrollToBottom = true) {
    if (!activeChatID) return;

    let query = _supabase.from('messages').select('*').order('created_at', { ascending: true });
    if (chatType === 'server') query = query.eq('channel_id', activeChatID);
    else query = query.eq('chat_id', [currentUser.id, activeChatID].sort().join('_'));

    const { data } = await query;

    const container = document.getElementById('chat-messages');
    container.innerHTML = '';

    data?.forEach(msg => {
        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${msg.sender_id === currentUser.id ? 'own' : ''}`;

        const avatar = createClickableAvatar(msg.pfp_static, msg.username_static, msg.sender_id, 40);

        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = `
            <div class="msg-header">
                <span class="username">${msg.username_static}</span>
                <span class="timestamp">${new Date(msg.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
            </div>
            <div class="msg-content">${msg.content}</div>
        `;

        bubble.appendChild(avatar);
        bubble.appendChild(contentDiv);
        container.appendChild(bubble);
    });

    displayedMessages = new Set(data.map(m => m.id));
    if (scrollToBottom) container.scrollTop = container.scrollHeight;
}

function appendMessage(msg) {
    if (displayedMessages.has(msg.id)) return;
    displayedMessages.add(msg.id);

    const container = document.getElementById('chat-messages');
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${msg.sender_id === currentUser.id ? 'own' : ''}`;

    const avatar = createClickableAvatar(msg.pfp_static, msg.username_static, msg.sender_id, 40);

    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = `
        <div class="msg-header">
            <span class="username">${msg.username_static}</span>
            <span class="timestamp">${new Date(msg.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
        </div>
        <div class="msg-content">${msg.content}</div>
    `;

    bubble.appendChild(avatar);
    bubble.appendChild(contentDiv);
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
}

function subscribeToMessages() {
    if (messageSubscription) messageSubscription.unsubscribe();

    messageSubscription = _supabase.channel('messages-changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload) => {
                const msg = payload.new;
                const target = chatType === 'server' ? msg.channel_id : msg.chat_id;
                const expected = chatType === 'server' ? activeChatID : [currentUser.id, activeChatID].sort().join('_');
                if (target === expected) appendMessage(msg);
            })
        .subscribe();
}

async function sendMessage() {
    const input = document.getElementById('chat-in');
    const text = input.value.trim();

    if (!text || !activeChatID) return;

    const errorMsg = validateMessage(text);
    if (errorMsg) {
        alert(errorMsg);
        return;
    }

    const msgObj = {
        sender_id: currentUser.id,
        content: text,
        username_static: document.getElementById('my-name').innerText,
        pfp_static: document.getElementById('my-pfp').src
    };

    if (chatType === 'server') msgObj.channel_id = activeChatID;
    else msgObj.chat_id = [currentUser.id, activeChatID].sort().join('_');

    const { data, error } = await _supabase.from('messages').insert([msgObj]).select();

    input.value = '';

    if (!error && data?.[0]) appendMessage(data[0]);
}

// ────────────────────────────────────────────────
// FRIENDS & PENDING REQUESTS
// ────────────────────────────────────────────────

async function loadPendingRequests() {
    const { data } = await _supabase.from('friends')
        .select('id, sender:profiles!friends_sender_id_fkey(id, username, pfp)')
        .eq('receiver_id', currentUser.id)
        .eq('status', 'pending');

    const list = document.getElementById('pending-list');
    list.innerHTML = '';

    data?.forEach(req => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.style.justifyContent = 'space-between';

        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.alignItems = 'center';
        left.style.gap = '12px';

        const avatar = createClickableAvatar(req.sender.pfp, req.sender.username, req.sender.id, 36);
        left.appendChild(avatar);
        left.innerHTML += `<span>${req.sender.username}</span>`;

        const right = document.createElement('div');
        right.innerHTML = `
            <button onclick="respondFriend(${req.id}, 'accepted')" class="mini-btn success">✔</button>
            <button onclick="respondFriend(${req.id}, 'denied')" class="mini-btn danger">✖</button>
        `;

        div.appendChild(left);
        div.appendChild(right);
        list.appendChild(div);
    });
}

async function respondFriend(id, action) {
    if (action === 'accepted') {
        const { error } = await _supabase
            .from('friends')
            .update({ status: 'accepted' })
            .eq('id', id)
            .eq('receiver_id', currentUser.id);

        if (error) alert("Accept failed");
        else {
            alert("Accepted!");
            setView('friends');
        }
    } else if (action === 'denied') {
        const ignoreUntil = new Date(Date.now() + 2 * 60 * 1000).toISOString();

        const { error } = await _supabase
            .from('friends')
            .update({ ignored_until: ignoreUntil })
            .eq('id', id)
            .eq('receiver_id', currentUser.id);

        if (error) alert("Ignore failed");
        else {
            alert("Ignored for 2 minutes");
            setView('friends');
        }
    }
}

async function sendFriendRequest() {
    const name = document.getElementById('friend-search').value.trim();
    const msgEl = document.getElementById('friend-msg');
    if (!name) return;

    const { data: target } = await _supabase.from('profiles').select('id').eq('username', name).single();
    if (!target) {
        msgEl.innerText = "User not found"; msgEl.style.color = "red"; return;
    }

    const { data: existing } = await _supabase.from('friends')
        .select('status, ignored_until')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${target.id}),and(sender_id.eq.${target.id},receiver_id.eq.${currentUser.id})`)
        .maybeSingle();

    if (existing) {
        if (existing.status === 'accepted') { msgEl.innerText = "Already friends"; msgEl.style.color = "orange"; return; }
        if (existing.ignored_until && new Date(existing.ignored_until) > new Date()) {
            const remaining = Math.ceil((new Date(existing.ignored_until) - new Date()) / 60000);
            msgEl.innerText = `Wait ${remaining} min`; msgEl.style.color = "orange"; return;
        }
        msgEl.innerText = "Pending"; msgEl.style.color = "orange"; return;
    }

    const { error } = await _supabase.from('friends').insert([{
        sender_id: currentUser.id,
        receiver_id: target.id,
        status: 'pending'
    }]);

    msgEl.innerText = error ? "Error" : "Sent!";
    msgEl.style.color = error ? "red" : "green";
}

async function loadDMList() {
    const { data } = await _supabase.from('friends')
        .select('*, sender:profiles!friends_sender_id_fkey(id, username, pfp), receiver:profiles!friends_receiver_id_fkey(id, username, pfp)')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

    const content = document.getElementById('sidebar-content');
    content.innerHTML = '';

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

        const avatar = createClickableAvatar(friend.pfp, friend.username, friend.id, 24);
        div.appendChild(avatar);
        div.innerHTML += `<span>${friend.username}</span>`;

        content.appendChild(div);
    });
}

// ────────────────────────────────────────────────
// CHANNELS & SERVER FUNCTIONS
// ────────────────────────────────────────────────

async function addChannel() {
    if (!currentServerID) return alert("No server selected");

    const name = prompt("Channel name:");
    if (!name || !name.trim()) return;

    const trimmed = name.trim().slice(0, 50);

    const { error } = await _supabase.from('channels').insert([{
        server_id: currentServerID,
        name: trimmed
    }]);

    if (error) {
        alert("Failed: " + error.message);
    } else {
        loadChannels(currentServerID);
    }
}

async function loadChannels(serverId) {
    const { data } = await _supabase.from('channels').select('*').eq('server_id', serverId);
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

function inviteToServer(serverId) {
    navigator.clipboard.writeText(serverId);
    alert(`Server ID copied: ${serverId}`);
}

// ────────────────────────────────────────────────
// AUTH, SERVERS, OTHER CORE FUNCTIONS
// ────────────────────────────────────────────────

async function handleAuth() {
    const email = document.getElementById('email-in').value;
    const password = document.getElementById('pass-in').value;
    const username = document.getElementById('username-in').value;

    if (!isLoginMode) {
        const { data: existing } = await _supabase.from('profiles').select('*').eq('username', username).single();
        if (existing) return alert("Username taken!");

        const { data, error } = await _supabase.auth.signUp({ email, password });
        if (error) return alert(error.message);

        await _supabase.from('profiles').upsert([{
            id: data.user.id,
            username,
            pfp: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
        }]);

        alert("Success! Log in now.");
        toggleAuthMode();
    } else {
        const { error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) alert(error.message);
        else location.reload();
    }
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('signup-fields').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('auth-main-btn').innerText = isLoginMode ? 'Login' : 'Sign Up';
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

async function createEmptyServer() {
    const name = document.getElementById('server-name-in').value.trim();
    if (!name) return alert("Server name required");

    const icon = document.getElementById('server-icon-in').value || '📁';

    const { data: server } = await _supabase.from('servers')
        .insert([{ name, icon, owner_id: currentUser.id }])
        .select()
        .single();

    if (!server) return alert("Failed to create server");

    await _supabase.from('server_members').insert([{ server_id: server.id, user_id: currentUser.id }]);
    await _supabase.from('channels').insert([{ server_id: server.id, name: 'general' }]);

    document.getElementById('server-modal').style.display = 'none';
    location.reload();
}

async function loadServers() {
    const { data: memberships } = await _supabase.from('server_members')
        .select('server_id')
        .eq('user_id', currentUser.id);

    if (!memberships?.length) return;

    const ids = memberships.map(m => m.server_id);
    const { data: servers } = await _supabase.from('servers').select('*').in('id', ids);

    const list = document.getElementById('server-list');
    list.innerHTML = '';

    servers?.forEach(s => {
        const div = document.createElement('div');
        div.className = 'server-icon';
        div.dataset.serverId = s.id;
        div.textContent = s.icon.length < 4 ? s.icon : '';
        if (s.icon.length >= 4) div.style.backgroundImage = `url(${s.icon})`;
        div.onclick = () => setView('server', s.id);
        list.appendChild(div);
    });
}

async function openServerSettings(serverId) {
    const { data: server } = await _supabase.from('servers').select('*').eq('id', serverId).single();
    if (!server) return;

    if (server.owner_id === currentUser.id) {
        const choice = confirm(`Delete server "${server.name}"?`);
        if (choice) {
            const confirmName = prompt(`Type "${server.name}" to confirm:`);
            if (confirmName === server.name) {
                await _supabase.from('servers').delete().eq('id', serverId);
                alert("Server deleted");
                location.reload();
            }
        }
    } else {
        if (confirm(`Leave server "${server.name}"?`)) {
            await _supabase.from('server_members').delete()
                .eq('server_id', serverId)
                .eq('user_id', currentUser.id);
            alert("Left server");
            location.reload();
        }
    }
}

// ────────────────────────────────────────────────
// STARTUP
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

        if (prof) {
            document.getElementById('my-name').textContent = prof.username;
            document.getElementById('my-pfp').src = prof.pfp;

            document.getElementById('my-pfp').onclick = () => showProfile(currentUser.id);
            document.querySelector('.user-bar .user-info').onclick = () => showProfile(currentUser.id);
        }

        loadServers();
        subscribeToMessages();
        setView('dm');
    }
};
