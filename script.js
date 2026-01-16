/** * AeroSocial Pro v4.0 - Fixed Edition 
* Fixes: General Channel Clickability & Owner Settings Access
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
            alert("Account created!"); 
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
// 2. SERVER & CHANNEL LOGIC (FIXED)
// ────────────────────────────────────────────────

// FIX: Check if current user owns the server to show settings
async function checkServerOwnership(serverId) {
    const settingsBtn = document.getElementById('server-settings-btn');
    if (!settingsBtn) return;

    if (serverId === GLOBAL_SERVER_ID) {
        settingsBtn.style.display = 'none';
        return;
    }

    const { data: server } = await _supabase
        .from('servers')
        .select('owner_id')
        .eq('id', serverId)
        .single();

    if (server && server.owner_id === currentUser.id) {
        settingsBtn.style.display = 'block'; // Show settings icon
    } else {
        settingsBtn.style.display = 'none'; // Hide for non-owners
    }
}

async function loadChannels(serverId, autoSelect = false) { 
    const content = document.getElementById('sidebar-content'); 
    content.innerHTML = '';

    const { data, error } = await _supabase 
        .from('channels') 
        .select('*') 
        .eq('server_id', serverId) 
        .order('created_at', { ascending: true });

    if (error || !data?.length) { 
        content.innerHTML = '<div style="padding:20px; opacity:0.6; text-align:center;">No channels</div>'; 
        return; 
    } 

    data.forEach((ch, i) => { 
        const div = document.createElement('div'); 
        div.className = 'friend-item channel-item'; // Added specific class
        div.setAttribute('data-ch-id', ch.id);
        div.innerHTML = `<span style="color:#7289da; font-weight:bold; margin-right:4px;">#</span>${ch.name}`; 
        
        // FIX: Improved click handler
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

// ────────────────────────────────────────────────
// 3. CHAT ENGINE
// ────────────────────────────────────────────────
async function loadMessages() { 
    if (!activeChatID) return; 
    const container = document.getElementById('chat-messages'); 
    
    let query = _supabase.from('messages').select('*').order('created_at', { ascending: true }); 
    
    if (chatType === 'server') { 
        query = query.eq('channel_id', activeChatID); 
    } else { 
        query = query.eq('chat_id', [currentUser.id, activeChatID].sort().join('_')); 
    }

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
            <span class="msg-meta">
                ${msg.username_static}
                ${isMe ? `<span class="del-btn" onclick="deleteMessage('${msg.id}')">×</span>` : ''}
            </span>
            <div class="msg-content">${msg.content}</div>
        </div>`; 
    container.appendChild(div); 
    container.scrollTop = container.scrollHeight; 
}

// ────────────────────────────────────────────────
// 4. VIEW & NAVIGATION (FIXED)
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
        header.innerHTML = 'Direct Messages'; 
        loadDMList(); 
        document.querySelector('.server-icon[onclick*="dm"]')?.classList.add('active'); 
    } else { 
        sidebarRight.style.display = 'flex'; 
        header.innerHTML = 'Channels'; 
        
        const activeIcon = document.querySelector(`.server-icon[onclick*="${id}"]`); 
        if(activeIcon) activeIcon.classList.add('active');

        loadChannels(id, true); 
        loadServerMembers(id);
        checkServerOwnership(id); // FIX: Restore settings for owner
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

function setupRealtime() { 
    _supabase.channel('public-chat') 
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => { 
            loadMessages(); 
        }) 
        .subscribe(); 
}

// Extra helper functions for Profile/General stay the same...
async function ensureGlobalGeneralChannel() { 
    const { data: existing } = await _supabase.from('channels').select('id').eq('server_id', GLOBAL_SERVER_ID).eq('name', 'general').maybeSingle(); 
    if (!existing) { await _supabase.from('channels').insert({ server_id: GLOBAL_SERVER_ID, name: 'general' }); } 
}
