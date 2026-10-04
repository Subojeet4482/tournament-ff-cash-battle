/**
 * Find friends: search, friend requests, report/block.
 */
import { collection, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove, query, limit, addDoc, where, deleteDoc, serverTimestamp, dbService } from '../../../js/core/firebase.js';

Object.assign(window.chat, {
    /* ---------- 2. SEARCH FRIEND ---------- */
    setFsTab(t, el){
        document.querySelectorAll('#chat-sub-search .chat-tab').forEach(x=>x.classList.remove('active'));
        el.classList.add('active');
        ['results','requests','friends'].forEach(k=>document.getElementById('fs-'+k).classList.add('hidden'));
        document.getElementById('fs-'+t).classList.remove('hidden');
        this._lastFsTab = t;
        if(t==='requests') this.loadRequests();
        if(t==='friends')  this.loadFriendList();
    },
    async searchUsers(q){
        const box = document.getElementById('fs-results');
        q = (q||'').trim().toLowerCase();
        if(q.length < 2){ box.innerHTML = '<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><div>Type 2+ chars to search</div></div>'; return; }
        box.innerHTML = '<div class="empty-state">Searching...</div>';
        try{
            const q1 = query(collection(dbService,'users'), where('username','>=',q), where('username','<=',q+'\uf8ff'), limit(20));
            const s1 = await getDocs(q1);
            let list = [];
            s1.forEach(d=>{ if(d.id!==window.db.user_uid) list.push({id:d.id,...d.data()}); });
            if(!list.length){ box.innerHTML='<div class="empty-state"><i class="fa-solid fa-user-slash"></i><div>No users found</div></div>'; return; }
            const friends = (window.db.user_data||{}).friends || [];
            const outgoing = (window.db.user_data||{}).outgoingReq || [];
            box.innerHTML = list.map(u=>{
                let btn;
                if(friends.includes(u.id)) btn = `<button class="fi-action outline" onclick="chat.openDM('${u.id}','${(u.name||'').replace(/[\\'"<>&`]/g,'')}')">Message</button>`;
                else if(outgoing.includes(u.id)) btn = `<button class="fi-action outline" onclick="chat.cancelRequest('${u.id}')">Cancel</button>`;
                else btn = `<button class="fi-action primary" onclick="chat.sendRequest('${u.id}')">Add</button>`;
                return `<div class="friend-item">
                  <div class="fi-avatar" style="cursor:pointer;" onclick="chat.openProfileById('${u.id}')">${u.photoURL?`<img src="${u.photoURL}">`:(u.name||'U')[0].toUpperCase()}</div>
                  <div class="fi-body" style="cursor:pointer;" onclick="chat.openProfileById('${u.id}')"><div class="fi-name">${this._safe(u.name||'User')} ${u.isVerified?'<i class="fa-solid fa-circle-check fi-badge-verified"></i>':''}</div>
                  <div class="fi-sub">@${this._safe(u.username||u.id.slice(0,8))} ${u.online?'<span style="color:#10b981;">● online</span>':'<span style="color:var(--text-muted);">● offline</span>'}</div></div>
                  ${btn}
                </div>`;
            }).join('');
        }catch(e){ box.innerHTML = '<div class="empty-state">Error: '+e.message+'</div>'; }
    },
    async sendRequest(toUid){
        try{
            await addDoc(collection(dbService,'friend_requests'),{
                from: window.db.user_uid, to: toUid, status:'pending', createdAt: serverTimestamp()
            });
            await updateDoc(doc(dbService,'users',window.db.user_uid),{outgoingReq: arrayUnion(toUid)});
            (window.db.user_data.outgoingReq = window.db.user_data.outgoingReq||[]).push(toUid);
            ui.toast('Request sent');
            document.getElementById('fs-input').dispatchEvent(new Event('input'));
        }catch(e){ ui.toast('Error: '+e.message); }
    },
    async cancelRequest(toUid){
        const q1 = query(collection(dbService,'friend_requests'), where('from','==',window.db.user_uid), where('to','==',toUid), where('status','==','pending'));
        const s = await getDocs(q1); s.forEach(d=>deleteDoc(d.ref));
        await updateDoc(doc(dbService,'users',window.db.user_uid),{outgoingReq: arrayRemove(toUid)});
        window.db.user_data.outgoingReq = (window.db.user_data.outgoingReq||[]).filter(x=>x!==toUid);
        ui.toast('Cancelled');
    },
    async loadRequests(){
        const box = document.getElementById('fs-requests');
        box.innerHTML = '<div class="empty-state">Loading...</div>';
        try{
            const me = window.db.user_uid;
            const [inSnap, outSnap] = await Promise.all([
                getDocs(query(collection(dbService,'friend_requests'), where('to','==',me), where('status','==','pending'))),
                getDocs(query(collection(dbService,'friend_requests'), where('from','==',me), where('status','==','pending')))
            ]);
            let html = '';
            // Incoming
            html += `<div style="padding:10px 14px 6px;font-weight:800;font-size:0.82rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Incoming (${inSnap.size})</div>`;
            if(inSnap.empty){
                html += '<div class="empty-state" style="padding:16px;"><i class="fa-solid fa-inbox"></i><div>No new requests</div></div>';
            }else{
                for(const d of inSnap.docs){
                    const req = d.data();
                    const u = await getDoc(doc(dbService,'users',req.from));
                    const ud = u.exists()? u.data() : {name:'User'};
                    const av = ud.photoURL?`<img src="${ud.photoURL}">`:((ud.name||'U')[0]||'U').toUpperCase();
                    html += `<div class="friend-item">
                      <div class="fi-avatar" style="cursor:pointer;" onclick="chat.openProfileById('${req.from}')">${av}</div>
                      <div class="fi-body" style="cursor:pointer;" onclick="chat.openProfileById('${req.from}')"><div class="fi-name">${this._safe(ud.name||'User')} ${ud.isVerified?'<i class="fa-solid fa-circle-check fi-badge-verified"></i>':''}</div><div class="fi-sub">@${this._safe(ud.username||req.from.slice(0,8))}</div></div>
                      <button class="fi-action primary" onclick="chat.acceptRequest('${d.id}','${req.from}')">Accept</button>
                      <button class="fi-action danger" style="margin-left:4px;" onclick="chat.rejectRequest('${d.id}','${req.from}')">Reject</button>
                    </div>`;
                }
            }
            // Outgoing
            html += `<div style="padding:14px 14px 6px;font-weight:800;font-size:0.82rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Sent (${outSnap.size})</div>`;
            if(outSnap.empty){
                html += '<div class="empty-state" style="padding:16px;"><i class="fa-solid fa-paper-plane"></i><div>No pending sent requests</div></div>';
            }else{
                for(const d of outSnap.docs){
                    const req = d.data();
                    const u = await getDoc(doc(dbService,'users',req.to));
                    const ud = u.exists()? u.data() : {name:'User'};
                    const av = ud.photoURL?`<img src="${ud.photoURL}">`:((ud.name||'U')[0]||'U').toUpperCase();
                    html += `<div class="friend-item">
                      <div class="fi-avatar" style="cursor:pointer;" onclick="chat.openProfileById('${req.to}')">${av}</div>
                      <div class="fi-body" style="cursor:pointer;" onclick="chat.openProfileById('${req.to}')"><div class="fi-name">${this._safe(ud.name||'User')} ${ud.isVerified?'<i class="fa-solid fa-circle-check fi-badge-verified"></i>':''}</div><div class="fi-sub">@${this._safe(ud.username||req.to.slice(0,8))} · <span style="color:var(--text-muted);">Pending</span></div></div>
                      <button class="fi-action outline" onclick="chat.cancelRequest('${req.to}')">Cancel</button>
                    </div>`;
                }
            }
            box.innerHTML = html;
        }catch(e){ box.innerHTML='<div class="empty-state">'+e.message+'</div>'; }
    },
    async acceptRequest(reqId, fromUid){
        const me = window.db.user_uid;
        await updateDoc(doc(dbService,'friend_requests',reqId),{status:'accepted', respondedAt: serverTimestamp()});
        await updateDoc(doc(dbService,'users',me),{friends: arrayUnion(fromUid)});
        await updateDoc(doc(dbService,'users',fromUid),{friends: arrayUnion(me), outgoingReq: arrayRemove(me)});
        window.db.user_data.friends = (window.db.user_data.friends||[]).concat(fromUid);
        ui.toast('Friend added'); this.loadRequests();
    },
    async rejectRequest(reqId, fromUid){
        await updateDoc(doc(dbService,'friend_requests',reqId),{status:'rejected'});
        await updateDoc(doc(dbService,'users',fromUid),{outgoingReq: arrayRemove(window.db.user_uid)});
        ui.toast('Rejected'); this.loadRequests();
    },
    async loadFriendList(){
        const box = document.getElementById('fs-friends');
        const ids = (window.db.user_data||{}).friends || [];
        if(!ids.length){ box.innerHTML='<div class="empty-state"><i class="fa-solid fa-user-group"></i><div>No friends yet</div></div>'; return; }
        box.innerHTML = '<div class="empty-state">Loading...</div>';
        let out = [];
        for(const id of ids){
            const u = await getDoc(doc(dbService,'users',id));
            if(!u.exists()) continue;
            const ud = u.data();
            out.push(`<div class="friend-item">
                <div class="fi-avatar" style="cursor:pointer;" onclick="chat.openProfileById('${id}')">${ud.photoURL?`<img src="${ud.photoURL}">`:(ud.name||'U')[0].toUpperCase()}</div>
                <div class="fi-body" style="cursor:pointer;" onclick="chat.openProfileById('${id}')"><div class="fi-name">${this._safe(ud.name||'User')} ${ud.online?'<span class="fi-online-dot"></span>':'<span class="fi-offline-dot"></span>'}</div><div class="fi-sub">@${this._safe(ud.username||id.slice(0,8))}</div></div>
                <button class="fi-action outline" onclick="chat.openDM('${id}','${(ud.name||'').replace(/[\\'"<>&`]/g,'')}')"><i class="fa-solid fa-message"></i></button>
            </div>`);
        }
        box.innerHTML = out.join('') || '<div class="empty-state">No friends</div>';
    },
    async blockUser(uid){
        if(!confirm('Block this user? They cannot message you.')) return;
        await updateDoc(doc(dbService,'users',window.db.user_uid),{blockList: arrayUnion(uid), friends: arrayRemove(uid)});
        (window.db.user_data.blockList=window.db.user_data.blockList||[]).push(uid);
        ui.toast('Blocked');
    },
    async reportUser(uid, reason){
        await addDoc(collection(dbService,'reports'),{type:'user', target:uid, reporter:window.db.user_uid, reason:reason||'inappropriate', createdAt: serverTimestamp(), status:'open'});
        ui.toast('Reported');
    },
});
