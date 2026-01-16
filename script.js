const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co'; 
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = null; // Can be a User ID (for DM) or Channel ID (for Server)
let chatType = 'dm'; // 'dm' or 'server'
let selectedFile = null;

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

// --- DM SYSTEM ---
async function loadDMList() {
    // Fetches friends where status is accepted to build DM sidebar
    const { data } = await _supabase.from('friends')
        .select('*, sender:profiles!friends_sender_id_fkey(id, username, pfp), receiver:profiles!friends_receiver_id_fkey(id, username, pfp)')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

    const content = document.getElementById('sidebar-content');
    
    data?.forEach(rel => {
        const friend = rel.sender_id === currentUser.id ? rel.receiver : rel.sender;
        const div = document.createElement('div');
        div.className = `friend-item ${activeChatID === friend.id ? 'active-chat' : ''}`;
        div.onclick = () => { 
            activeChatID = friend.id; 
            chatType = 'dm'; 
            loadMessages(); 
            // Optional: visual feedback for selection
            document.querySelectorAll('.friend-item').forEach(el => el.classList.remove('active-chat'));
            div.classList.add('active-chat');
        };
        div.innerHTML = `
            <img src="${friend.pfp}" class="pfp-img" style="width:24px; height:24px;"> 
            <span>${friend.username}</span>
        `;
        content.appendChild(div);
    });
}

// --- FRIEND REQUESTS (SEND/ACCEPT/DENY) ---
function renderFriendsUI() {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = `
        <div style="padding: 15px;">
            <input type="text" id="friend-search" placeholder="Enter Username..." class="input-box" style="background:white; margin-bottom:10px;">
            <button class="aero-btn" onclick="sendFriendRequest()">Send Request</button>
        </div>
        <div class="section-label">Pending Requests</div>
        <div id="pending-list"></div>
    `;
    loadPendingRequests();
}

async function sendFriendRequest() {
    const name = document.getElementById('friend-search').value;
    if (!name) return;

    const { data: target } = await _supabase.from('profiles').eq('username', name).single();
    if (!target) return alert("User not found");
    if (target.id === currentUser.id) return alert("You cannot add yourself!");

    const { error } = await _supabase.from('friends').insert([{ 
        sender_id: currentUser.id, 
        receiver_id: target.id, 
        status: 'pending' 
    }]);

    if (error) alert("Request already exists or error occurred.");
    else alert("Friend request sent to " + name);
}

async function loadPendingRequests() {
    const { data } = await _supabase.from('friends')
        .select('id, profiles!friends_sender_id_fkey(username, pfp)')
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
                <img src="${req.profiles.pfp}" class="pfp-img" style="width:24px; height:24px;">
                <span>${req.profiles.username}</span>
            </div>
            <div style="display:flex; gap:5px;">
                <button onclick="respondFriend(${req.id}, 'accepted')" class="mini-btn">✔</button>
                <button onclick="respondFriend(${req.id}, 'denied')" class="mini-btn" style="color:red">✖</button>
            </div>
        `;
        list.appendChild(div);
    });
}

async function respondFriend(id, status) {
    if (status === 'denied') {
        await _supabase.from('friends').delete().eq('id', id);
    } else {
        await _supabase.from('friends').update({ status }).eq('id', id);
        alert("Friend added!");
    }
    setView('friends');
}

// --- SERVER SYSTEM ---
async function createEmptyServer() {
    const name = document.getElementById('server-name-in').value;
    const icon = document.getElementById('server-icon-in').value || '📁';
    if(!name) return alert("Please enter a server name");

    const { data: server, error } = await _supabase.from('servers')
        .insert([{ name, icon, owner_id: currentUser.id }])
        .select().single();
    
    if(error) return alert(error.message);

    // Auto-create standard channels
    await _supabase.from('channels').insert([
        { server_id: server.id, name: 'general' },
        { server_id: server.id, name: 'media' }
    ]);
    
    document.getElementById('server-modal').style.display = 'none';
    location.reload();
}

async function loadServers() {
    const { data } = await _supabase.from('servers').select('*');
    const list = document.getElementById('server-list');
    list.innerHTML = '';

    data?.forEach(s => {
        const div = document.createElement('div');
        div.className = 'server-icon';
        if(s.icon.length < 4) {
            div.innerText = s.icon;
        } else {
            div.style.backgroundImage = `url(${s.icon})`;
            div.style.backgroundSize = 'cover';
        }
        div.onclick = () => setView('server', s.id);
        list.appendChild(div);
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
        };
        content.appendChild(div);
    });
}

// --- PROFILE CUSTOMIZATION ---
function openProfile() {
    document.getElementById('profile-modal').style.display = 'flex';
    document.getElementById('edit-username').value = document.getElementById('my-name').innerText;
}

function closeProfile() {
    document.getElementById('profile-modal').style.display = 'none';
    selectedFile = null;
}

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

if(dropZone) {
    dropZone.onclick = () => fileInput.click();
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
    dropZone.ondragleave = () => dropZone.classList.remove('dragover');
    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files[0]);
    };
    fileInput.onchange = (e) => handleFiles(e.target.files[0]);
}

function handleFiles(file) {
    if (!file || !file.type.startsWith('image/')) return;
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('preview-img').src = e.target.result;
        document.getElementById('preview-img').style.display = 'block';
    };
    reader.readAsDataURL(file);
}

async function saveProfile() {
    let pfpUrl = document.getElementById('my-pfp').src;
    const newUsername = document.getElementById('edit-username').value;

    if (selectedFile) {
        const fileName = `${currentUser.id}_avatar_${Date.now()}.png`;
        const { error } = await _supabase.storage.from('avatars').upload(fileName, selectedFile, { upsert: true });
        if (error) return alert("Upload failed: " + error.message);
        const { data: publicUrl } = _supabase.storage.from('avatars').getPublicUrl(fileName);
        pfpUrl = publicUrl.publicUrl;
    }

    await _supabase.from('profiles').upsert({ id: currentUser.id, username: newUsername, pfp: pfpUrl });
    location.reload(); 
}

// --- MESSAGING ---
async function sendMessage() {
    const input = document.getElementById('chat-in');
    if (!input.value.trim() || !activeChatID) return;

    const msgObj = {
        sender_id: currentUser.id,
        content: input.value,
        username_static: document.getElementById('my-name').innerText,
        pfp_static: document.getElementById('my-pfp').src
    };

    if (chatType === 'server') {
        msgObj.channel_id = activeChatID;
    } else {
        // Group ID logic: sort IDs alphabetically and join with underscore
        msgObj.chat_id = [currentUser.id, activeChatID].sort().join('_');
    }

    await _supabase.from('messages').insert([msgObj]);
    input.value = '';
}

async function loadMessages() {
    if (!activeChatID) return;
    
    let query = _supabase.from('messages').select('*').order('created_at', { ascending: true });
    
    if (chatType === 'server') {
        query = query.eq('channel_id', activeChatID);
    } else {
        const dm_id = [currentUser.id, activeChatID].sort().join('_');
        query = query.eq('chat_id', dm_id);
    }

    const { data } = await query;
    const box = document.getElementById('chat-messages');
    box.innerHTML = data?.map(msg => `
        <div class="message-bubble">
            <img src="${msg.pfp_static}" class="pfp-img" style="width:35px; height:35px;">
            <div>
                <div style="font-weight:bold; font-size:12px; color:#0078d7;">${msg.username_static}</div>
                <div style="font-size:14px;">${msg.content}</div>
            </div>
        </div>
    `).join('') || '';
    box.scrollTop = box.scrollHeight;
}

// --- AUTH ---
function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('signup-fields').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('auth-main-btn').innerText = isLoginMode ? 'Login' : 'Sign Up';
    document.getElementById('auth-toggle').innerText = isLoginMode ? "Need an account? Sign Up" : "Already have an account? Login";
}

async function handleAuth() {
    const email = document.getElementById('email-in').value;
    const password = document.getElementById('pass-in').value;
    
    if (isLoginMode) {
        const { error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) return alert(error.message);
        location.reload();
    } else {
        const username = document.getElementById('username-in').value;
        const { data, error } = await _supabase.auth.signUp({ email, password });
        if (error) return alert(error.message);
        
        // Initial profile creation
        await _supabase.from('profiles').upsert([{ 
            id: data.user.id, 
            username, 
            pfp: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}` 
        }]);
        alert("Signup successful! Please log in.");
        toggleAuthMode();
    }
}

// --- INIT ---
window.onload = async () => {
    const { data: { user } } = await _supabase.auth.getUser();
    if (user) {
        currentUser = user;
        document.getElementById('auth-overlay').style.display = 'none';
        
        // Load User Profile
        const { data: prof } = await _supabase.from('profiles').select('*').eq('id', user.id).single();
        if (prof) {
            document.getElementById('my-name').innerText = prof.username;
            document.getElementById('my-pfp').src = prof.pfp;
        }

        loadServers();
        // Subscribe to real-time messages
        _supabase.channel('messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, loadMessages)
            .subscribe();
        
        setView('dm');
    }
};
