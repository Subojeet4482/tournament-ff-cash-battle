/**
 * DM / group thread: open, stream, send, header menu, contact profile.
 */
import { collection, doc, setDoc, getDoc, updateDoc, arrayUnion, query, orderBy, limit, addDoc, serverTimestamp, onSnapshot, dbService } from '../../../js/core/firebase.js';

Object.assign(window.chat, {
    _chatId(a,b){ return [a,b].sort().join('__'); },
    async openDM(peerUid, peerName){
        const cid = this._chatId(window.db.user_uid, peerUid);
        this._thread = { type:'dm', id:cid, peer:peerUid, peerName };
        // ensure chat doc
        try{ await setDoc(doc(dbService,'chats',cid),{members:[window.db.user_uid, peerUid].sort(), createdAt: serverTimestamp()},{merge:true}); }catch(e){}
        document.querySelectorAll('.chat-sub-view').forEach(v=>v.classList.add('hidden'));
        document.getElementById('chat-sub-thread').classList.remove('hidden');
        document.getElementById('th-name').innerText = peerName || 'Chat';
        document.getElementById('th-avatar').innerText = (peerName||'U')[0].toUpperCase();
        this._streamThread('chats/'+cid+'/messages');
    },
    async openGroup(gid, gname){
        this._thread = { type:'group', id:gid, groupName:gname };
        document.querySelectorAll('.chat-sub-view').forEach(v=>v.classList.add('hidden'));
        document.getElementById('chat-sub-thread').classList.remove('hidden');
        document.getElementById('th-name').innerText = gname || 'Group';
        document.getElementById('th-avatar').innerText = (gname||'G')[0].toUpperCase();
        this._streamThread('groups/'+gid+'/messages');
    },
    _streamThread(path){
        if(this._unsubs.thread){ this._unsubs.thread(); }
        const parts = path.split('/');
        const col = collection(dbService, ...parts);
        const q1 = query(col, orderBy('createdAt','desc'), limit(100));
        this._unsubs.thread = onSnapshot(q1,(s)=>{
            const box = document.getElementById('th-messages');
            const items=[]; s.forEach(d=>items.push({id:d.id,...d.data()}));
            items.reverse();
            box.innerHTML = items.map(m=>this._renderMsg(m,'thread')).join('') || '<div class="empty-state">Say hi 👋</div>';
            box.scrollTop = box.scrollHeight;
        });
    },
    closeThread(){
        if(this._unsubs.thread) this._unsubs.thread();
        this._thread = null;
        document.getElementById('chat-sub-thread').classList.add('hidden');
        document.getElementById('chat-sub-friends').classList.remove('hidden');
    },
    async sendThread(){
        if(!this._thread) return;
        const inp = document.getElementById('th-input');
        const text = inp.value.trim(); if(!text) return;
        inp.value='';
        const base = { uid: window.db.user_uid, name: window.db.user_name||'User', text, type:'text', createdAt: serverTimestamp() };
        if(this._replyTo.th){ base.replyTo = this._replyTo.th; this.cancelReply('th'); }
        try{
            if(this._thread.type==='dm') await addDoc(collection(dbService,'chats',this._thread.id,'messages'), base);
            else                          await addDoc(collection(dbService,'groups',this._thread.id,'messages'), base);
        }catch(e){ ui.toast('Error: '+e.message); }
    },
    typing(){ /* debounce could go here */ },
    recordVoice(){ ui.toast('Hold mic (coming soon)'); },
    startCall(kind){ ui.toast((kind==='video'?'Video':'Voice')+' call coming soon'); },
    toggleEmoji(scope){
        const emojis = ['😀','😂','😍','😎','👍','🙏','🎉','🔥','❤️','😢','😮','😡','💯','👏','🙌','🤔','😴','🥳','😭','😇'];
        const inpId = scope==='th' ? 'th-input' : 'wc-input';
        const html = '<div style="font-weight:800;padding:4px 8px 10px;">Emoji</div>'+
          '<div style="display:grid;grid-template-columns:repeat(8,1fr);gap:6px;padding:4px 8px;">'+
          emojis.map(e=>`<div class="cx-act" style="justify-content:center;font-size:1.4rem;padding:10px 0;" data-em="${e}">${e}</div>`).join('')+'</div>';
        openSheet(html);
        _sheetEl.querySelectorAll('[data-em]').forEach(el=>el.onclick=()=>{
            const inp=document.getElementById(inpId); if(inp){ inp.value+=el.dataset.em; inp.focus(); }
            closeSheet();
        });
    },
    async openContactProfile(){
        if(!this._thread) return;
        if(this._thread.type==='group'){ this.openMembers && this.openMembers(this._thread.id); return; }
        const peer = this._thread.peer; if(!peer){ ui.toast('No profile'); return; }
        try{
            const s = await getDoc(doc(dbService,'users',peer));
            if(!s.exists()){ ui.toast('User not found'); return; }
            const u = s.data();
            const avatar = u.photoURL?`<img src="${u.photoURL}">`:(u.name||'U')[0].toUpperCase();
            const bio = (u.bio||'').replace(/[<>&]/g,'') || 'No bio yet.';
            const uname = (u.username||peer.slice(0,8)).replace(/[<>&]/g,'');
            const html = `
              <div class="th-profile-card">
                <div class="tp-avatar">${avatar}</div>
                <div class="tp-name">${(u.name||'User').replace(/[<>&]/g,'')}</div>
                <div class="tp-uname">@${uname}</div>
                <div class="tp-bio">${bio}</div>
                <div class="tp-quick">
                  <button class="tpq" data-act="voice"><i class="fa-solid fa-phone"></i>Voice</button>
                  <button class="tpq" data-act="video"><i class="fa-solid fa-video"></i>Video</button>
                  <button class="tpq" data-act="mute"><i class="fa-solid fa-bell-slash"></i>Mute</button>
                  <button class="tpq" data-act="search"><i class="fa-solid fa-magnifying-glass"></i>Search</button>
                  <button class="tpq danger" data-act="block"><i class="fa-solid fa-ban"></i>Block</button>
                </div>
              </div>`;
            openSheet(html);
            _sheetEl.querySelectorAll('[data-act]').forEach(el=>el.onclick=()=>{
                const a=el.dataset.act; closeSheet();
                if(a==='voice'||a==='video') this.startCall(a);
                else if(a==='mute') this.muteThread();
                else if(a==='search') this.searchThread();
                else if(a==='block') this.blockUser(peer);
            });
        }catch(e){ ui.toast(e.message); }
    },
    // Open any user's public profile card by UID (used when tapping avatar/name in World Chat)
    async openProfileById(uid){
        if(!uid) return;
        if(uid === window.db.user_uid){ this.openSub && this.openSub('profile'); return; }
        try{
            const s = await getDoc(doc(dbService,'users',uid));
            if(!s.exists()){ ui.toast('User not found'); return; }
            const u = s.data();
            const isPrivate = u.privacy === 'private';
            const avatar = u.photoURL?`<img src="${u.photoURL}">`:((u.name||'U')[0]||'U').toUpperCase();
            const bio = (u.bio||'').replace(/[<>&]/g,'') || 'No bio yet.';
            const uname = (u.username||uid.slice(0,8)).replace(/[<>&]/g,'');
            const verified = u.isVerified ? ' <i class="fa-solid fa-circle-check" style="color:#1d9bf0;"></i>' : '';
            const online = u.online ? '<span style="color:#10b981;font-weight:700;">● Online</span>' : '<span style="color:var(--text-muted);">Offline</span>';
            const lastSeen = u.lastSeen && u.lastSeen.seconds ? new Date(u.lastSeen.seconds*1000).toLocaleString() : '—';
            const friendCount = Array.isArray(u.friends) ? u.friends.length : 0;
            const meFriend = (window.db.user_data && (window.db.user_data.friends||[]).includes(uid));
            const privateBlock = (isPrivate && !meFriend) ? `
                <div style="margin-top:14px;padding:12px;background:var(--bg-input);border-radius:12px;text-align:center;font-size:0.82rem;color:var(--text-muted);">
                  <i class="fa-solid fa-lock"></i> This profile is private. Send a friend request to see details and chat.
                </div>
                <button class="tpq" data-act="request" style="margin-top:10px;width:100%;padding:12px;background:var(--primary);color:#fff;border:none;border-radius:12px;font-weight:700;"><i class="fa-solid fa-user-plus"></i> Send Friend Request</button>
            ` : `
                <div class="tp-bio">${bio}</div>
                <div style="display:flex;justify-content:space-around;margin-top:12px;font-size:0.8rem;">
                  <div><b>${friendCount}</b><div style="color:var(--text-muted);font-size:0.7rem;">Friends</div></div>
                  <div>${online}<div style="color:var(--text-muted);font-size:0.7rem;">Status</div></div>
                </div>
                <div style="text-align:center;font-size:0.7rem;color:var(--text-muted);margin-top:8px;">Last seen: ${lastSeen}</div>
                <div class="tp-quick" style="margin-top:14px;">
                  <button class="tpq" data-act="message"><i class="fa-solid fa-message"></i>Message</button>
                  <button class="tpq" data-act="request"><i class="fa-solid fa-user-plus"></i>Add</button>
                  <button class="tpq danger" data-act="block"><i class="fa-solid fa-ban"></i>Block</button>
                  <button class="tpq danger" data-act="report"><i class="fa-solid fa-flag"></i>Report</button>
                </div>
            `;
            const html = `
              <div class="th-profile-card">
                <div class="tp-avatar">${avatar}</div>
                <div class="tp-name">${(u.name||'User').replace(/[<>&]/g,'')}${verified}</div>
                <div class="tp-uname">@${uname}${isPrivate?' <i class="fa-solid fa-lock" title="Private"></i>':''}</div>
                ${privateBlock}
              </div>`;
            openSheet(html);
            _sheetEl.querySelectorAll('[data-act]').forEach(el=>el.onclick=()=>{
                const a=el.dataset.act; closeSheet();
                if(a==='message'){ this.openDM && this.openDM(uid, u.name||'User'); }
                else if(a==='request'){ this.sendFriendRequest && this.sendFriendRequest(uid); }
                else if(a==='block'){ this.blockUser(uid); }
                else if(a==='report'){ const r=prompt('Reason'); if(r) this.reportUser(uid, r); }
            });
        }catch(e){ ui.toast(e.message); }
    },
    muteThread(){
        if(!this._thread) return;
        try{ updateDoc(doc(dbService,'users',window.db.user_uid),{muted: arrayUnion(this._thread.id)}).then(()=>ui.toast('Muted')); }catch(e){ui.toast(e.message);}
    },
    searchThread(){
        const term = prompt('Search in chat:'); if(!term) return;
        const rows = document.querySelectorAll('#th-messages .msg-row');
        let hits = 0;
        rows.forEach(r=>{ const t=r.innerText.toLowerCase(); if(t.includes(term.toLowerCase())){ r.style.background='rgba(245,158,11,.18)'; hits++; setTimeout(()=>r.style.background='',3500);} });
        ui.toast(hits+' match'+(hits===1?'':'es'));
    },
    clearThreadUI(){
        if(!confirm('Clear this chat from your view? (Messages remain for the other side)')) return;
        const box=document.getElementById('th-messages'); if(box) box.innerHTML='<div class="empty-state">Chat cleared</div>';
        ui.toast('Cleared');
    },
    openMediaFiles(){
        const rows = document.querySelectorAll('#th-messages .msg-img, #th-messages .msg-vid, #th-messages .msg-file');
        if(!rows.length){ openSheet('<div style="padding:24px;text-align:center;color:var(--text-muted);">No media or files yet</div>'); return; }
        const items = Array.from(rows).map(r=>{
            if(r.classList.contains('msg-img')) return `<img src="${r.src}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;">`;
            if(r.classList.contains('msg-vid')) return `<video src="${r.src}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;background:#000;"></video>`;
            return `<a href="${r.href}" target="_blank" style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--bg-input);border-radius:10px;font-size:0.78rem;color:var(--text-main);text-decoration:none;grid-column:1/-1;"><i class="fa-solid fa-file"></i>${r.innerText||'File'}</a>`;
        }).join('');
        openSheet('<div style="font-weight:800;padding:4px 8px 10px;">Media & files</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:0 6px;">'+items+'</div>');
    },
    threadMenu(){
        if(!this._thread) return;
        if(this._thread.type!=='dm'){ return; } // group menu handled below
        const acts = [
            {ic:'user',lbl:'View contact',fn:()=>{closeSheet();this.openContactProfile();}},
            {ic:'magnifying-glass',lbl:'Search in chat',fn:()=>{closeSheet();this.searchThread();}},
            {ic:'images',lbl:'Media, links & files',fn:()=>{closeSheet();this.openMediaFiles();}},
            {ic:'bell-slash',lbl:'Mute notifications',fn:()=>{closeSheet();this.muteThread();}},
            {ic:'thumbtack',lbl:'Pin chat',fn:()=>{closeSheet();try{updateDoc(doc(dbService,'users',window.db.user_uid),{pinnedChats:arrayUnion(this._thread.id)}).then(()=>ui.toast('Pinned'));}catch(e){ui.toast(e.message);}}},
            {ic:'box-archive',lbl:'Archive chat',fn:()=>{closeSheet();try{updateDoc(doc(dbService,'users',window.db.user_uid),{archived:arrayUnion(this._thread.id)}).then(()=>ui.toast('Archived'));}catch(e){ui.toast(e.message);}}},
            {ic:'palette',lbl:'Wallpaper & theme',fn:()=>{closeSheet();ui.toast('Wallpaper coming soon');}},
            {ic:'eraser',lbl:'Clear chat',cls:'admin',fn:()=>{closeSheet();this.clearThreadUI();}},
            {ic:'ban',lbl:'Block user',cls:'danger',fn:()=>{closeSheet();if(confirm('Block this user?')) this.blockUser(this._thread.peer);}},
            {ic:'flag',lbl:'Report',cls:'danger',fn:()=>{closeSheet();const r=prompt('Reason'); if(r) this.reportUser(this._thread.peer||this._thread.id, r);}},
        ];
        openSheet(acts.map((a,i)=>`<div class="cx-act ${a.cls||''}" data-i="${i}"><i class="fa-solid fa-${a.ic}"></i>${a.lbl}</div>`).join(''));
        _sheetEl.querySelectorAll('.cx-act').forEach(el=>el.onclick=()=>acts[+el.dataset.i].fn());
    },
});
