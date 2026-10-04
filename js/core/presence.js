/**
 * Real online/offline presence (Firestore heartbeat).
 */
import { collection, doc, setDoc, serverTimestamp, onSnapshot, dbService } from './firebase.js';

// =====================================================================
// PRESENCE (real online/offline) + SILENT AUTO-REFRESH
// Firestore-based: writes /presence/{uid} every 20s. Others considered
// online if lastSeen < 45s ago. onDisconnect via 'beforeunload'/'pagehide'.
// If you want rock-solid presence (auto-offline when tab crashes),
// enable Firebase Realtime Database and use onDisconnect() there.
// =====================================================================
window.presence = (function(){
    const STALE_MS = 45 * 1000;    // >45s without heartbeat = offline
    const HEARTBEAT_MS = 20 * 1000;
    let hbTimer = null;
    const cache = new Map(); // uid -> { lastSeen: Date, state }

    async function beat(state){
        const uid = window.db && window.db.user_uid;
        if(!uid) return;
        try{
            await setDoc(doc(dbService,'presence',uid), {
                state: state || 'online',
                lastSeen: serverTimestamp(),
                ua: navigator.userAgent.slice(0,120)
            }, {merge:true});
        }catch(e){ /* silent */ }
    }
    function start(){
        stop();
        beat('online');
        hbTimer = setInterval(()=>beat('online'), HEARTBEAT_MS);
        // Subscribe to presence collection so friends' online status is live
        try{
            if(window._presUnsub) window._presUnsub();
            window._presUnsub = onSnapshot(collection(dbService,'presence'), (snap)=>{
                snap.forEach(d => {
                    const v = d.data() || {};
                    const ls = v.lastSeen && v.lastSeen.toDate ? v.lastSeen.toDate() : (v.lastSeen ? new Date(v.lastSeen) : new Date(0));
                    cache.set(d.id, { lastSeen: ls, state: v.state || 'online' });
                });
                // Update visible dots (own profile friend list + chat headers)
                if(window.chat && window.chat._renderProfileFriends && document.getElementById('cp-friends-grid')){
                    try{ window.chat._renderProfileFriends(); }catch(e){}
                }
                updateSelfBadge();
            });
        }catch(e){}
        // Best-effort offline write on unload
        const goingOffline = () => { try{ beat('offline'); }catch(e){} };
        window.addEventListener('pagehide', goingOffline);
        window.addEventListener('beforeunload', goingOffline);
        document.addEventListener('visibilitychange', () => {
            if(document.visibilityState === 'hidden'){ /* keep online during brief bg */ }
            else { beat('online'); }
        });
    }
    function stop(){ if(hbTimer){ clearInterval(hbTimer); hbTimer=null; } }
    function isOnline(uid, userDoc){
        const c = cache.get(uid);
        if(c){ return c.state === 'online' && (Date.now() - c.lastSeen.getTime()) < STALE_MS; }
        // fallback to user_data.online if presence not yet loaded
        return userDoc ? (userDoc.online === true) : false;
    }
    function lastSeen(uid){ const c = cache.get(uid); return c ? c.lastSeen : null; }
    function updateSelfBadge(){
        const st = document.getElementById('cp-status');
        if(!st) return;
        const on = isOnline(window.db.user_uid);
        st.innerHTML = on ? '<span style="color:#10b981;">● Online</span>' : '<span style="color:#94a3b8;">● Offline</span>';
    }
    return { start, stop, isOnline, lastSeen, beat };
})();

// Start presence right after auth
(function(){
    const origInit = window.app && window.app.init;
    // Hook: when auth resolves and user_uid becomes available, start presence.
    let started = false;
    setInterval(()=>{
        if(!started && window.db && window.db.user_uid){
            started = true;
            try{ window.presence.start(); }catch(e){ console.warn('presence start failed', e); }
        }
    }, 1500);
})();
