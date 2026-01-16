/**
 * AeroSocial Pro v2.0
 * Features: Aero Glass Logic, DM/Server Routing, 20m Profile Cooldown
 */

const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// Global App State
let currentUser = null;
let activeChatID = null;
let currentServerID = null;
let chatType = 'dm';
let lastProfileUpdate = null;
let isLoginMode = false; // <--- ADD THIS LINE

// Constants
const PROFILE_COOLDOWN_MINUTES = 20;

// ────────────────────────────────────────────────
// 1. APP INITIALIZATION
// ────────────────────────────────────────────────

window.onload = async () => {
    const { data: { user } } = await _supabase.auth.getUser();

    if (user) {
        currentUser = user;
        document.getElementById('auth-overlay').style.display = 'none';

        // Load User Profile
        const { data: prof } = await _supabase.from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (prof) {
            updateLocalUI(prof.username, prof.pfp);
        }

        setupRealtime();
        loadServers();
        setView('dm'); // Default view
    } else {
        document.getElementById('auth-overlay').style.display = 'flex';
    }
};

function updateLocalUI(name, pfp) {
    document.getElementById('my-name').textContent = name;
    document.getElementById('my-pfp').src = pfp || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
}

// ────────────────────────────────────────────────
// 2. VIEW & NAVIGATION LOGIC
// ────────────────────────────────────────────────

function setView(view, id = null) {
    const content = document.getElementById('sidebar-content');
    const header = document.getElementById('sidebar-header');
    
    // Clear current state
    content.innerHTML = '';
    activeChatID = null;
    document.getElementById('chat-messages').innerHTML = '<div class="glass-panel" style="margin:20px; padding:10px; text-align:center;">Select a conversation to start chatting</div>';

    // UI Feedback for Sidebar Icons
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
        header.innerHTML = `<span>Channels</span> <span class="settings-gear" onclick="openServerSettings('${id}')">⚙️</span>`;
        document.querySelector(`.server-icon[data-server-id="${id}"]`)?.classList.add('active');
        loadChannels(id);
    }
}

// ────────────────────────────────────────────────
// 3. CHAT & MESSAGING ENGINE
// ────────────────────────────────────────────────

/**
 * Creates a unique, consistent ID for DMs between two users
 */
function getPairID(friendId) {
    return [currentUser.id, friendId].sort().join('_');
}

async function loadMessages() {
    if (!activeChatID) return;
    
    const container = document.getElementById('chat-messages');
    container.innerHTML = '<div class="loading">Loading messages...</div>';

    let query = _supabase.from('messages').select('*').order('created_at', { ascending: true });

    if (chatType === 'server') {
        query = query.eq('channel_id', activeChatID);
    } else {
        query = query.eq('chat_id', getPairID(activeChatID));
    }

    const { data, error } = await query;
    if (error) return console.error("Load Error:", error);

    container.innerHTML = ''; // Clear loading
    data.forEach(msg => appendMessageUI(msg));
    scrollToBottom();
}

async function sendMessage() {
    const input = document.getElementById('chat-in');
    const text = input.value.trim();

    if (!text || !activeChatID || !currentUser) return;

    const msgObj = {
        sender_id: currentUser.id,
        content: text,
        username_static: document.getElementById('my-name').innerText,
        pfp_static: document.getElementById('my-pfp').src
    };

    // Corrected Routing Logic
    if (chatType === 'server') {
        msgObj.channel_id = activeChatID;
        msgObj.chat_id = null;
    } else {
        msgObj.chat_id = getPairID(activeChatID);
        msgObj.receiver_id = activeChatID;
        msgObj.channel_id = null;
    }

    input.value = ''; 

    const { error } = await _supabase.from('messages').insert([msgObj]);
    if (error) {
        console.error("Insert Error:", error.message);
        alert("Failed to send: " + error.message);
    }
}

function appendMessageUI(msg) {
    const container = document.getElementById('chat-messages');
    const isMe = msg.sender_id === currentUser.id;
    
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isMe ? 'own' : ''}`;
    
    bubble.innerHTML = `
        <img src="${msg.pfp_static}" class="pfp-img" onclick="showProfile('${msg.sender_id}')" style="cursor:pointer; width:35px; height:35px;">
        <div class="msg-body">
            <div class="msg-header">
                <span class="username" style="font-weight:bold; font-size:11px; opacity:0.7;">${msg.username_static}</span>
            </div>
            <div class="msg-content">${msg.content}</div>
        </div>
    `;
    
    container.appendChild(bubble);
    scrollToBottom();
}

function scrollToBottom() {
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
}

// ────────────────────────────────────────────────
// 4. REALTIME ENGINE
// ────────────────────────────────────────────────

function setupRealtime() {
    _supabase.channel('room1')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const msg = payload.new;
            
            // Logic: Only show the message if it belongs to the current open chat
            if (chatType === 'server' && msg.channel_id === activeChatID) {
                appendMessageUI(msg);
            } else if (chatType === 'dm') {
                const currentRoom = getPairID(activeChatID);
                if (msg.chat_id === currentRoom) {
                    appendMessageUI(msg);
                }
            }
        })
        .subscribe();
}

// ────────────────────────────────────────────────
// 5. PROFILE & COOLDOWN LOGIC
// ────────────────────────────────────────────────

async function showProfile(userId) {
    const { data: prof, error } = await _supabase.from('profiles').select('*').eq('id', userId).single();
    if (error || !prof) return;

    const isOwn = userId === currentUser.id;
    
    document.getElementById('profile-title').innerText = isOwn ? "Your Profile" : `${prof.username}'s Profile`;
    document.getElementById('profile-pfp-large').src = prof.pfp;
    document.getElementById('profile-username').value = prof.username;

    // Show/Hide edit section
    document.getElementById('edit-profile-section').style.display = isOwn ? 'block' : 'none';
    
    if (isOwn) {
        document.getElementById('edit-username').value = prof.username;
        document.getElementById('edit-pfp-url').value = prof.pfp;
    }

    document.getElementById('profile-modal').style.display = 'flex';
}

async function saveProfileChanges() {
    const now = Date.now();
    
    // 20 Minute Check
    if (lastProfileUpdate) {
        const diff = (now - lastProfileUpdate) / 1000 / 60;
        if (diff < PROFILE_COOLDOWN_MINUTES) {
            const remaining = Math.ceil(PROFILE_COOLDOWN_MINUTES - diff);
            return alert(`Aero Security: Please wait ${remaining} more minutes to change your profile again.`);
        }
    }

    const newName = document.getElementById('edit-username').value.trim();
    const newPfp = document.getElementById('edit-pfp-url').value.trim();

    if (!newName) return alert("Username cannot be empty");

    const { error } = await _supabase.from('profiles')
        .update({ username: newName, pfp: newPfp })
        .eq('id', currentUser.id);

    if (error) {
        alert("Error: " + error.message);
    } else {
        lastProfileUpdate = now;
        alert("Profile Updated!");
        location.reload(); // Refresh to apply changes everywhere
    }
}

function closeProfileModal() {
    document.getElementById('profile-modal').style.display = 'none';
}

// ────────────────────────────────────────────────
// 6. LIST LOADING (DMs & SERVERS)
// ────────────────────────────────────────────────

async function loadDMList() {
    const { data } = await _supabase.from('friends')
        .select('*, sender:profiles!friends_sender_id_fkey(*), receiver:profiles!friends_receiver_id_fkey(*)')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

    const content = document.getElementById('sidebar-content');
    
    if (!data || data.length === 0) {
        content.innerHTML = '<div style="padding:20px; font-size:12px; opacity:0.6;">No friends yet. Add some in the Friends tab!</div>';
        return;
    }

    data.forEach(rel => {
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

        div.innerHTML = `
            <div style="position:relative">
                <img src="${friend.pfp}" class="pfp-img" style="width:30px; height:30px;">
                <div style="width:8px; height:8px; background:#2ecc71; border-radius:50%; position:absolute; bottom:0; right:0; border:1px solid white;"></div>
            </div>
            <span>${friend.username}</span>
        `;
        content.appendChild(div);
    });
}

// ────────────────────────────────────────────────
// 7. AUTHENTICATION (SIGNUP / LOGIN)
// ────────────────────────────────────────────────

async function handleAuth() {
    const email = document.getElementById('email-in').value;
    const password = document.getElementById('pass-in').value;
    const username = document.getElementById('username-in').value.trim();

    if (!email || !password) return alert("Please fill in all fields.");

    if (!isLoginMode) {
        // Sign Up Mode
        if (!username) return alert("Please choose a display name.");
        
        const { data, error } = await _supabase.auth.signUp({ email, password });
        
        if (error) return alert(error.message);

        // Create the profile in the 'profiles' table immediately
        const { error: profileError } = await _supabase.from('profiles').upsert([{
            id: data.user.id,
            username: username,
            pfp: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
        }]);

        if (profileError) console.error(profileError);
        alert("Account created! You can now log in.");
        toggleAuthMode();
    } else {
        // Login Mode
        const { error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) alert(error.message);
        else location.reload(); // Refresh to trigger window.onload logic
    }
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('signup-fields').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('auth-main-btn').innerText = isLoginMode ? 'Login' : 'Sign Up';
    document.getElementById('auth-toggle').innerText = isLoginMode 
        ? "Don't have an account? Sign Up" 
        : "Already have an account? Login";
}

// ────────────────────────────────────────────────
// 8. SERVER MANAGEMENT (CREATE / JOIN)
// ────────────────────────────────────────────────

async function createOrJoinServer() {
    const input = document.getElementById('server-name-in').value.trim();
    const icon = document.getElementById('server-icon-in').value.trim() || "🌐";

    if (!input) return;

    // Check if input is a UUID (Joining a server) or a Name (Creating one)
    const isId = input.length > 20 && input.includes('-');

    if (isId) {
        // JOIN LOGIC
        const { error } = await _supabase.from('server_members').insert([
            { server_id: input, user_id: currentUser.id }
        ]);
        if (error) alert("Could not join server. Check the ID.");
        else location.reload();
    } else {
        // CREATE LOGIC
        const { data: server, error: sErr } = await _supabase.from('servers').insert([
            { name: input, icon: icon, owner_id: currentUser.id }
        ]).select().single();

        if (sErr) return alert(sErr.message);

        // Auto-join the creator to the server
        await _supabase.from('server_members').insert([
            { server_id: server.id, user_id: currentUser.id }
        ]);

        // Create a default #general channel
        await _supabase.from('channels').insert([
            { server_id: server.id, name: 'general' }
        ]);

        alert(`Server Created! Share this ID to invite friends: ${server.id}`);
        location.reload();
    }
}

async function loadServers() {
    const { data: memberships } = await _supabase.from('server_members')
        .select('server_id')
        .eq('user_id', currentUser.id);

    if (!memberships || memberships.length === 0) return;

    const serverIds = memberships.map(m => m.server_id);
    const { data: servers } = await _supabase.from('servers').select('*').in('id', serverIds);

    const list = document.getElementById('server-list');
    list.innerHTML = '';

    servers?.forEach(s => {
        const div = document.createElement('div');
        div.className = 'server-icon';
        div.dataset.serverId = s.id;
        
        // Use icon URL if it looks like a link, otherwise use emoji/text
        if (s.icon.startsWith('http')) {
            div.style.backgroundImage = `url(${s.icon})`;
            div.style.backgroundSize = 'cover';
        } else {
            div.textContent = s.icon;
        }

        div.onclick = () => setView('server', s.id);
        list.appendChild(div);
    });
}

// ────────────────────────────────────────────────
// SERVER SETTINGS LOGIC
// ────────────────────────────────────────────────

function openServerSettings(serverId) {
    currentServerID = serverId;
    document.getElementById('server-settings-modal').style.display = 'flex';
}

function closeServerSettings() {
    document.getElementById('server-settings-modal').style.display = 'none';
}

// 1. ADD NEW CHANNELS
async function createNewChannel() {
    const nameInput = document.getElementById('new-channel-name');
    const name = nameInput.value.trim().toLowerCase().replace(/\s+/g, '-');

    if (!name) return;

    const { error } = await _supabase.from('channels').insert([
        { server_id: currentServerID, name: name }
    ]);

    if (error) {
        alert("Error creating channel: " + error.message);
    } else {
        nameInput.value = '';
        closeServerSettings();
        loadChannels(currentServerID); // Refresh the list
    }
}

// 2. UPDATE SERVER IMAGE
async function updateServerIcon() {
    const newIcon = document.getElementById('edit-server-icon').value.trim();
    if (!newIcon) return;

    const { error } = await _supabase.from('servers')
        .update({ icon: newIcon })
        .eq('id', currentServerID);

    if (error) {
        alert("Error updating icon: " + error.message);
    } else {
        alert("Server icon updated!");
        location.reload();
    }
}

// 3. DELETE SERVER
async function deleteServer() {
    const confirmDelete = confirm("Are you sure? This will delete the server and all messages forever.");
    if (!confirmDelete) return;

    // Check if user is the owner (Optional but recommended)
    const { data: server } = await _supabase.from('servers').select('owner_id').eq('id', currentServerID).single();
    
    if (server.owner_id !== currentUser.id) {
        return alert("Only the owner can delete this server.");
    }

    const { error } = await _supabase.from('servers').delete().eq('id', currentServerID);

    if (error) {
        alert("Error deleting server: " + error.message);
    } else {
        alert("Server deleted.");
        location.reload();
    }
}

async function loadChannels(serverId) {
    const content = document.getElementById('sidebar-content');
    
    // 1. CLEAR the sidebar so old buttons don't stay there
    content.innerHTML = ''; 

    const { data, error } = await _supabase.from('channels')
        .select('*')
        .eq('server_id', serverId);

    if (error) return console.error(error);

    // 2. Add the "Invite" button (only once now)
    const inviteBtn = document.createElement('div');
    inviteBtn.className = 'friend-item';
    inviteBtn.style.color = 'var(--accent)';
    inviteBtn.innerHTML = `<strong>+ Copy Server ID</strong>`;
    inviteBtn.onclick = () => {
        navigator.clipboard.writeText(serverId);
        alert("Server ID copied! Send this to friends.");
    };
    content.appendChild(inviteBtn);

    // 3. Add the actual channels
    data?.forEach(ch => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerText = `# ${ch.name}`;
        
        // Highlight active channel
        if (activeChatID === ch.id) div.classList.add('active-chat');

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

function renderFriendsUI() {
    const content = document.getElementById('sidebar-content');
    // Clear previous content first
    content.innerHTML = `
        <div style="padding:20px;">
            <h4 style="margin-bottom:10px; font-size:12px; color:var(--accent);">ADD FRIEND</h4>
            <input type="text" id="friend-id-in" class="input-box" placeholder="Paste User ID here..." style="margin-bottom:10px;">
            <button class="aero-btn" onclick="sendFriendRequest()">Send Request</button>
            <hr style="margin:20px 0; opacity:0.1;">
            <p style="font-size:11px; opacity:0.6;">Your ID: <br><strong>${currentUser.id}</strong></p>
        </div>
    `;
}
