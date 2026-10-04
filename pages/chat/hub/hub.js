/**
 * Chat hub: open/close sub-pages, presence flag.
 */
import { doc, updateDoc, serverTimestamp, dbService } from '../../../js/core/firebase.js';

Object.assign(window.chat, {
    onOpen(){
        // Refresh unread badges + presence
        if(!window.db.user_uid) return;
        this._openedOnce = true;
        this.setPresence(true);
        this.loadWorld();
        this.loadFriends();
    },
    openSub(name){
        document.getElementById('chat-hub').classList.add('hidden');
        document.querySelectorAll('.chat-sub-view').forEach(v=>v.classList.add('hidden'));
        document.getElementById('chat-sub-'+name).classList.remove('hidden');
        if(name==='profile') this.renderProfile();
        if(name==='world')   this.streamWorld();
        if(name==='search')  this.loadRequests();
        if(name==='friends') this.streamFriends();
        if(name==='discover')this.loadDiscover('trending');
    },
    backToHub(){
        document.querySelectorAll('.chat-sub-view').forEach(v=>v.classList.add('hidden'));
        document.getElementById('chat-hub').classList.remove('hidden');
        this._stopStreams();
    },
    _stopStreams(){
        Object.values(this._unsubs).forEach(u=>{try{u();}catch(e){}});
        this._unsubs = {};
    },
    /* ---------- PRESENCE ---------- */
    async setPresence(online){
        if(!window.db.user_uid) return;
        try{
            await updateDoc(doc(dbService,'users',window.db.user_uid),{
                online: !!online, lastSeen: serverTimestamp()
            });
        }catch(e){}
    },
});

// Presence lifecycle
window.addEventListener('beforeunload',()=>{ if(window.chat) window.chat.setPresence(false); });
document.addEventListener('visibilitychange',()=>{ if(window.chat && window.db.user_uid) window.chat.setPresence(!document.hidden); });
