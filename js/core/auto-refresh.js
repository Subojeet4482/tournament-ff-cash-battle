/**
 * Silent 15s data refresh (no loaders, no reload).
 */
import { doc, getDoc, onSnapshot, dbService } from './firebase.js';

// =====================================================================
// SILENT AUTO-REFRESH — every 15s, refresh data that isn't already
// driven by onSnapshot. No visible loaders, no page reload.
// =====================================================================
window.autoRefresh = (function(){
    let t = null;
    const REFRESH_MS = 15 * 1000;
    async function tick(){
        if(document.visibilityState !== 'visible') return;
        if(!window.db || !window.db.user_uid) return;
        try{
            // Refresh own user doc (balance, friends, blocklist, etc.)
            const s = await getDoc(doc(dbService,'users', window.db.user_uid));
            if(s.exists()){
                const prev = window.db.user_data || {};
                const nu = s.data();
                window.db.user_data = nu;
                window.db.balance = nu.balance || 0;
                window.db.depositBalance = nu.depositBalance || 0;
                window.db.withdrawBalance = nu.withdrawBalance || 0;
                // Update visible balance badges if any
                document.querySelectorAll('[data-live=balance]').forEach(el => el.innerText = (nu.balance||0));
                // Re-render profile if it's the visible sub-view
                const p = document.getElementById('chat-sub-profile');
                if(p && !p.classList.contains('hidden') && window.chat && window.chat.renderProfile){
                    try{ window.chat.renderProfile(); }catch(e){}
                }
                // Refresh friend list if friends array changed
                if(JSON.stringify(prev.friends||[]) !== JSON.stringify(nu.friends||[])){
                    try{ window.chat && window.chat._renderProfileFriends && window.chat._renderProfileFriends(); }catch(e){}
                }
            }
        }catch(e){}
    }
    function start(){ if(t) clearInterval(t); t = setInterval(tick, REFRESH_MS); }
    function stop(){ if(t){ clearInterval(t); t=null; } }
    return { start, stop, tick };
})();
setTimeout(()=>window.autoRefresh.start(), 3000);
