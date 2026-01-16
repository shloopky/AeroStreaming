// script.js - AeroSocial (complete version with profile cooldown & aero-ready bubbles)

const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
// WARNING: In production → use environment variables / never commit this key

const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = null;
let currentServerID = null;
let chatType = 'dm';
let isLoginMode = false;
let displayedMessages = new Set();
let messageSubscription = null;
let currentProfileUserId = null;

// Profile edit cooldown
let lastProfileUpdate = null;
const PROFILE_COOLDOWN_MINUTES = 20;

// ────────────────────────────────────────────────
// VIEW SWITCHING
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
            <span class="settings-gear" onclick="openServerSettings('${id}')">⚙️</span>
        `;
        document.querySelector(`.server-icon[data-server-id="${id}"]`)?.classList.add('active');
        loadChannels(id);
    }
}

// ────────────────────────────────────────────────
// PROFILE MODAL + COOLDOWN LOGIC
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

    document.getElementById('profile-modal').style.display = 'flex';
}

function closeProfileModal() {
    document.getElementById('profile-modal').style.display = 'none';
    currentProfileUserId = null;
}

async function saveProfileChanges() {
    if (currentProfileUserId !== currentUser.id) return;

    const now = Date.now();

    if (lastProfileUpdate) {
        const minutesPassed = (now - lastProfileUpdate) / 1000 / 60;
        if (minutesPassed < PROFILE_COOLDOWN_MINUTES) {
            const remaining = Math.ceil(PROFILE_COOLDOWN_MINUTES - minutesPassed);
            alert(`You can only update your profile every ${PROFILE_COOLDOWN_MINUTES} minutes.\nWait ${remaining} more minute${remaining > 1 ? 's' : ''}.`);
            return;
        }
    }

    const newName = document.getElementById('edit-username').value.trim();
    let newPfp = document.getElementById('edit-pfp-url').value.trim();

    if (!newName) {
        alert("Username cannot be empty");
        return;
    }

    if (!newPfp) {
        newPfp = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(newName)}`;
    }

    if (newPfp && !newPfp.startsWith('https://')) {
        alert("Profile picture must be a valid HTTPS URL (or leave empty for random avatar)");
        return;
    }

    const { error } = await _supabase
        .from('profiles')
        .update({
            username: newName,
            pfp: newPfp,
            updated_at: new Date().toISOString()
        })
        .eq('id', currentUser.id);

    if (error) {
        alert("Error saving profile: " + error.message);
        console.error(error);
        return;
    }

    lastProfileUpdate = now;
    document.getElementById('my-name').textContent = newName;
    document.getElementById('my-pfp').src = newPfp;

    alert(`Profile updated!\nNext change available in ${PROFILE_COOLDOWN_MINUTES} minutes.`);

    closeProfileModal();

    // Refresh visible name/avatar in UI where needed
    if (chatType === 'dm') loadDMList();
    if (activeChatID) loadMessages(false);
}

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
// MESSAGES – LOAD + REAL-TIME APPEND
// ────────────────────────────────────────────────

async function loadMessages(scrollToBottom = true) {
    if (!activeChatID) return;

    let query = _supabase.from('messages').select('*').order('created_at', { ascending: true });

    if (chatType === 'server') {
        query = query.eq('channel_id', activeChatID);
    } else {
        query = query.eq('chat_id', [currentUser.id, activeChatID].sort().join('_'));
    }

    const { data, error } = await query;
    if (error) {
        console.error("Messages load error:", error);
        return;
    }

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
                <span class="timestamp">${new Date(msg.created_at).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'})}</span>
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
            <span class="timestamp">${new Date(msg.created_at).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'})}</span>
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

                if (target === expected) {
                    appendMessage(msg);
                }
            })
        .subscribe();
}

// ────────────────────────────────────────────────
// FRIENDS / PENDING / DM LIST (clickable avatars)
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
        left.style.gap = '10px';

        const avatar = createClickableAvatar(req.sender.pfp, req.sender.username, req.sender.id, 32);
        left.appendChild(avatar);
        left.innerHTML += `<span>${req.sender.username}</span>`;

        const right = document.createElement('div');
        right.style.display = 'flex';
        right.style.gap = '5px';
        right.innerHTML = `
            <button onclick="respondFriend(${req.id}, 'accepted')" class="mini-btn">✔</button>
            <button onclick="respondFriend(${req.id}, 'denied')" class="mini-btn" style="color:red">✖</button>
        `;

        div.appendChild(left);
        div.appendChild(right);
        list.appendChild(div);
    });
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
// AUTH, FRIEND REQUEST, SERVER CREATION & MANAGEMENT
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

        alert("Account created! Please log in.");
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
        <div class="section-label">Join Server</div>
        <div style="padding: 15px;">
            <input type="text" id="server-id-in" placeholder="Enter Server ID..." class="input-box" style="background:white; margin-bottom:5px;">
            <button class="aero-btn" onclick="joinServer()">Join</button>
        </div>
    `;
    loadPendingRequests();
}

async function sendFriendRequest() {
    const name = document.getElementById('friend-search').value.trim();
    const msgEl = document.getElementById('friend-msg');
    if (!name) {
        msgEl.innerText = "Enter a username";
        msgEl.style.color = "orange";
        return;
    }

    // 1. Find the target user
    const { data: target, error: userError } = await _supabase
        .from('profiles')
        .select('id')
        .eq('username', name)
        .single();

    if (userError || !target) {
        msgEl.innerText = "User not found";
        msgEl.style.color = "red";
        return;
    }

    // 2. Optional: prevent self-request
    if (target.id === currentUser.id) {
        msgEl.innerText = "You can't add yourself";
        msgEl.style.color = "orange";
        return;
    }

    // 3. Check if relationship already exists (pending / accepted / denied)
    const { data: existing } = await _supabase
        .from('friends')
        .select('status')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${target.id}),and(sender_id.eq.${target.id},receiver_id.eq.${currentUser.id})`)
        .maybeSingle();  // returns one row or null

    if (existing) {
        if (existing.status === 'pending') {
            msgEl.innerText = "Request already pending";
        } else if (existing.status === 'accepted') {
            msgEl.innerText = "You're already friends";
        } else {
            msgEl.innerText = "Request was previously denied";
        }
        msgEl.style.color = "orange";
        return;
    }

    // 4. Actually send the request
    const { error: insertError } = await _supabase.from('friends').insert([{
        sender_id: currentUser.id,
        receiver_id: target.id,
        status: 'pending'
    }]);

    if (insertError) {
        console.error(insertError);
        if (insertError.code === '23505') {  // unique violation
            msgEl.innerText = "Request already exists (possible race condition)";
        } else {
            msgEl.innerText = "Error sending request";
        }
        msgEl.style.color = "red";
    } else {
        msgEl.innerText = "Friend request sent!";
        msgEl.style.color = "green";
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
        div.textContent = `# ${ch.name}`;
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
    alert(`Server ID copied:\n${serverId}\n\nShare this with friends to join.`);
}

async function joinServer() {
    const id = document.getElementById('server-id-in')?.value?.trim();
    if (!id) return alert("Enter a Server ID");

    const { data: server } = await _supabase.from('servers').select('id').eq('id', id).single();
    if (!server) return alert("Server not found");

    const { data: member } = await _supabase.from('server_members')
        .select('id').eq('server_id', id).eq('user_id', currentUser.id).single();

    if (member) return alert("Already a member");

    const { error } = await _supabase.from('server_members').insert([{
        server_id: id,
        user_id: currentUser.id
    }]);

    if (!error) {
        alert("Joined!");
        location.reload();
    } else {
        alert("Error joining");
    }
}

async function openServerSettings(serverId) {
    const { data: server } = await _supabase.from('servers').select('*').eq('id', serverId).single();
    if (!server) return;

    if (server.owner_id === currentUser.id) {
        if (!confirm(`Delete server "${server.name}"?`)) return;
        if (prompt(`Type "${server.name}" to confirm:`) !== server.name) return;

        await _supabase.from('servers').delete().eq('id', serverId);
        alert("Server deleted");
        location.reload();
    } else {
        if (!confirm(`Leave server "${server.name}"?`)) return;
        await _supabase.from('server_members').delete()
            .eq('server_id', serverId)
            .eq('user_id', currentUser.id);
        alert("Left server");
        location.reload();
    }
}

async function createEmptyServer() {
    const name = document.getElementById('server-name-in').value.trim();
    if (!name) return alert("Server name required");

    const icon = document.getElementById('server-icon-in').value.trim() || '📁';

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

async function sendMessage() {
    const input = document.getElementById('chat-in');
    const text = input.value.trim();
    if (!text || !activeChatID) return;

    const msg = {
        sender_id: currentUser.id,
        content: text,
        username_static: document.getElementById('my-name').textContent,
        pfp_static: document.getElementById('my-pfp').src
    };

    if (chatType === 'server') msg.channel_id = activeChatID;
    else msg.chat_id = [currentUser.id, activeChatID].sort().join('_');

    const { data, error } = await _supabase.from('messages').insert([msg]).select();

    input.value = '';

    if (!error && data?.[0]) appendMessage(data[0]);
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
