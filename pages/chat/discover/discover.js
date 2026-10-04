/**
 * Discover public groups + people.
 */
import { collection, getDocs, doc, updateDoc, arrayUnion, query, orderBy, limit, where, increment, dbService } from '../../../js/core/firebase.js';

Object.assign(window.chat, {
    /* ---------- 5. DISCOVER ---------- */
    setDcTab(t,el){
        document.querySelectorAll('#chat-sub-discover .chat-tab').forEach(x=>x.classList.remove('active'));
        el.classList.add('active');
        ['trending','public','people'].forEach(k=>document.getElementById('dc-'+k).classList.add('hidden'));
        document.getElementById('dc-'+t).classList.remove('hidden');
        this.loadDiscover(t);
    },
    async loadDiscover(t){
        const box = document.getElementById('dc-'+t);
        box.innerHTML = '<div class="empty-state">Loading...</div>';
        try{
            if(t==='people'){
                const s = await getDocs(query(collection(dbService,'users'), limit(20)));
                const me = window.db.user_uid; const friends=(window.db.user_data||{}).friends||[];
                const out=[]; s.forEach(d=>{ if(d.id===me||friends.includes(d.id)) return; const u=d.data();
                    out.push(`<div class="friend-item">
                      <div class="fi-avatar">${u.photoURL?`<img src="${u.photoURL}">`:(u.name||'U')[0].toUpperCase()}</div>
                      <div class="fi-body"><div class="fi-name">${chat._safe(u.name||'User')}</div><div class="fi-sub">@${chat._safe(u.username||d.id.slice(0,8))}</div></div>
                      <button class="fi-action primary" onclick="chat.sendRequest('${d.id}')">Add</button>
                    </div>`); });
                box.innerHTML = out.slice(0,15).join('') || '<div class="empty-state">No suggestions</div>';
                return;
            }
            const q1 = t==='trending'
                ? query(collection(dbService,'groups'), where('public','==',true), orderBy('memberCount','desc'), limit(20))
                : query(collection(dbService,'groups'), where('public','==',true), limit(30));
            const s = await getDocs(q1).catch(()=>getDocs(query(collection(dbService,'groups'), where('public','==',true), limit(30))));
            if(s.empty){ box.innerHTML='<div class="empty-state"><i class="fa-solid fa-users-slash"></i><div>No public groups yet</div></div>'; return; }
            const out=[]; s.forEach(d=>{ const g=d.data();
                const joined = (g.members||[]).includes(window.db.user_uid);
                out.push(`<div class="friend-item">
                  <div class="fi-avatar" style="background:linear-gradient(135deg,#0ea5e9,#4f46e5);">${(g.name||'G')[0].toUpperCase()}</div>
                  <div class="fi-body"><div class="fi-name">${chat._safe(g.name||'Group')}</div><div class="fi-sub">${(g.members||[]).length} members${g.category?' · '+g.category:''}</div></div>
                  ${joined?`<button class="fi-action outline" onclick="chat.openGroup('${d.id}','${(g.name||'').replace(/[\\'"<>&`]/g,'')}')">Open</button>`:`<button class="fi-action primary" onclick="chat.joinGroup('${d.id}')">Join</button>`}
                </div>`); });
            box.innerHTML = out.join('');
        }catch(e){ box.innerHTML='<div class="empty-state">'+e.message+'</div>'; }
    },
    async joinGroup(gid){
        try{ await updateDoc(doc(dbService,'groups',gid),{members: arrayUnion(window.db.user_uid), memberCount: increment(1)}); ui.toast('Joined'); this.loadDiscover('public'); }catch(e){ ui.toast(e.message); }
    },
});
