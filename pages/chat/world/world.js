/**
 * World chat stream + send.
 */
import { collection, query, orderBy, limit, addDoc, serverTimestamp, onSnapshot, dbService } from '../../../js/core/firebase.js';

Object.assign(window.chat, {
    /* ---------- 3. WORLD CHAT ---------- */
    loadWorld(){}, // opened via streamWorld
    streamWorld(){
        if(this._unsubs.world){ this._unsubs.world(); }
        const q1 = query(collection(dbService,'world_messages'), orderBy('createdAt','desc'), limit(80));
        this._unsubs.world = onSnapshot(q1,(s)=>{
            const box = document.getElementById('wc-messages');
            const items = []; s.forEach(d=>items.push({id:d.id,...d.data()}));
            items.reverse();
            box.innerHTML = items.map(m=>this._renderMsg(m,'world')).join('') || '<div class="empty-state"><i class="fa-solid fa-comments"></i><div>Be the first to say hi</div></div>';
            box.scrollTop = box.scrollHeight;
            // pinned
            const pinned = items.filter(m=>m.pinned);
            if(pinned.length){
                const p = pinned[pinned.length-1];
                const pb = document.getElementById('wc-pinned');
                pb.classList.remove('hidden');
                pb.innerHTML = '<i class="fa-solid fa-thumbtack"></i> <b>Pinned:</b> ' + this._safe(p.text||p.fileName||'[media]');
            }
        });
    },
    async sendWorld(){
        const inp = document.getElementById('wc-input');
        const text = inp.value.trim(); if(!text) return;
        inp.value = '';
        const payload = {
            uid: window.db.user_uid, name: window.db.user_name || 'User',
            photoURL: (window.db.user_data && window.db.user_data.photoURL) || '',
            text, type:'text', createdAt: serverTimestamp()
        };
        if(this._replyTo.wc){ payload.replyTo = this._replyTo.wc; this.cancelReply('wc'); }
        try{ await addDoc(collection(dbService,'world_messages'), payload); }
        catch(e){ ui.toast('Error: '+e.message); }
    },
    togglePinnedView(){ document.getElementById('wc-pinned').classList.toggle('hidden'); },
});
