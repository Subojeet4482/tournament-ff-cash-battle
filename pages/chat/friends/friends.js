/**
 * Friends & groups lists.
 */
import { collection, getDocs, doc, getDoc, query, orderBy, limit, addDoc, where, serverTimestamp, dbService } from '../../../js/core/firebase.js';

Object.assign(window.chat, {
    /* ---------- 4. FRIENDS & GROUPS ---------- */
    setFcTab(t,el){
        document.querySelectorAll('#chat-sub-friends .chat-tab').forEach(x=>x.classList.remove('active'));
        el.classList.add('active');
        ['dm','groups','archived'].forEach(k=>document.getElementById('fc-'+k).classList.add('hidden'));
        document.getElementById('fc-'+t).classList.remove('hidden');
        if(t==='groups') this.loadGroups();
        if(t==='archived') this.loadArchived();
    },
    streamFriends(){ this.loadFriends(); },
    async loadFriends(){
        const box = document.getElementById('fc-dm'); if(!box) return;
        const ids = (window.db.user_data||{}).friends || [];
        if(!ids.length){ box.innerHTML='<div class="empty-state"><i class="fa-solid fa-user-plus"></i><div>Add friends from Find Friend</div></div>'; return; }
        let out=[];
        for(const id of ids){
            const u = await getDoc(doc(dbService,'users',id));
            if(!u.exists()) continue; const ud=u.data();
            const cid = this._chatId(window.db.user_uid, id);
            let lastMsg=''; let unread=0;
            try{
                const ls = await getDocs(query(collection(dbService,'chats',cid,'messages'), orderBy('createdAt','desc'), limit(1)));
                ls.forEach(d=>{ const m=d.data(); lastMsg = m.text||('['+(m.type||'media')+']'); });
            }catch(e){}
            out.push(`<div class="friend-item" onclick="chat.openDM('${id}','${(ud.name||'').replace(/[\\'"<>&`]/g,'')}')">
                <div class="fi-avatar">${ud.photoURL?`<img src="${ud.photoURL}">`:(ud.name||'U')[0].toUpperCase()}</div>
                <div class="fi-body"><div class="fi-name">${chat._safe(ud.name||'User')} ${ud.online?'<span class="fi-online-dot"></span>':''}</div><div class="fi-sub">${this._safe(lastMsg)||'Say hi'}</div></div>
                ${unread?`<span style="background:var(--primary);color:#fff;border-radius:10px;padding:2px 8px;font-size:0.7rem;">${unread}</span>`:''}
            </div>`);
        }
        box.innerHTML = out.join('') || '<div class="empty-state">No chats yet</div>';
    },
    async loadGroups(){
        const box = document.getElementById('fc-groups');
        box.innerHTML = '<div class="empty-state">Loading...</div>';
        try{
            const q1 = query(collection(dbService,'groups'), where('members','array-contains', window.db.user_uid));
            const s = await getDocs(q1);
            if(s.empty){ box.innerHTML='<div class="empty-state"><i class="fa-solid fa-users"></i><div>No groups. Discover new ones!</div></div>'; return; }
            const out=[]; s.forEach(d=>{ const g=d.data(); out.push(`<div class="friend-item" onclick="chat.openGroup('${d.id}','${(g.name||'').replace(/[\\'"<>&`]/g,'')}')">
                <div class="fi-avatar" style="background:linear-gradient(135deg,#f59e0b,#f43f5e);">${(g.name||'G')[0].toUpperCase()}</div>
                <div class="fi-body"><div class="fi-name">${chat._safe(g.name||'Group')}</div><div class="fi-sub">${(g.members||[]).length} members</div></div>
            </div>`); });
            box.innerHTML = out.join('');
        }catch(e){ box.innerHTML='<div class="empty-state">'+e.message+'</div>'; }
    },
    loadArchived(){
        document.getElementById('fc-archived').innerHTML='<div class="empty-state"><i class="fa-solid fa-box-archive"></i><div>Archived chats</div></div>';
    },
    openNewGroup(){
        const name = prompt('Group name:'); if(!name) return;
        addDoc(collection(dbService,'groups'),{name, ownerUid:window.db.user_uid, members:[window.db.user_uid], public:false, createdAt: serverTimestamp()})
          .then(r=>{ ui.toast('Group created'); this.openGroup(r.id, name); });
    },
});
