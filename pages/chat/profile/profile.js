/**
 * Chat profile: view/edit profile, friends strip, block list.
 */
import { collection, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove, query, limit, where, serverTimestamp, sRef, uploadBytes, getDownloadURL, dbService, storageService } from '../../../js/core/firebase.js';

Object.assign(window.chat, {
    /* ---------- 1. PROFILE ---------- */
    renderProfile(){
        const u = window.db.user_data || {};
        document.getElementById('cp-name').firstChild.textContent = (u.name || window.db.user_name || 'User') + ' ';
        const uname = u.username || (window.db.user_uid||'').slice(0,8);
        const privBadge = u.privacy === 'private' ? '<i class="fa-solid fa-lock"></i> Private' : '';
        document.getElementById('cp-username').innerHTML = '@' + this._safe(uname) + ' <span style="font-size:0.7rem;color:var(--text-muted);margin-left:6px;">'+privBadge+'</span>';
        document.getElementById('cp-bio').innerText = u.bio || 'No bio yet.';
        const chats = (u.joinedGroups||[]).length + (u.dmList||[]).length;
        const cc = document.getElementById('cp-chats'); if(cc) cc.innerText = chats;
        document.getElementById('cp-friends').innerText = (u.friends||[]).length;
        const st = document.getElementById('cp-status');
        if(st) st.innerHTML = u.online!==false ? '<span style="color:#10b981;">● Online</span>' : '<span style="color:#ef4444;">● Offline</span>';
        document.getElementById('cp-verified').classList.toggle('hidden', !u.isVerified);
        const av = document.getElementById('cp-avatar');
        if(u.photoURL){ av.innerHTML = '<img src="'+u.photoURL+'">'; } else { av.textContent = (u.name||'U')[0].toUpperCase(); }
        const cov = document.getElementById('cp-cover');
        cov.innerHTML = u.coverURL ? '<img src="'+u.coverURL+'">' : '';
        this._renderProfileFriends();
    },
    async _renderProfileFriends(){
        const grid = document.getElementById('cp-friends-grid');
        const cnt = document.getElementById('cp-friends-count');
        if(!grid) return;
        const ids = ((window.db.user_data||{}).friends || []).slice();
        if(cnt) cnt.innerText = '('+ids.length+')';
        if(!ids.length){
            grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-user-group"></i><div style="font-weight:700;margin-top:6px;">No friends yet</div><div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">Search &amp; add friends to start chatting</div></div>';
            return;
        }
        grid.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:10px;">Loading...</div>';
        // Pinned first
        const pins = (window.db.user_data||{}).pinnedFriends || [];
        ids.sort((a,b)=>{ const pa=pins.includes(a)?0:1, pb=pins.includes(b)?0:1; return pa-pb; });
        const out = [];
        for(const id of ids.slice(0,80)){
            try{
                const s = await getDoc(doc(dbService,'users',id));
                if(!s.exists()) continue;
                const ud = s.data();
                const isOnline = !!(window.presence && window.presence.isOnline && window.presence.isOnline(id, ud));
                const av = ud.photoURL ? `<img src="${ud.photoURL}">` : ((ud.name||'U')[0]||'U').toUpperCase();
                const pinned = pins.includes(id);
                out.push(`<div class="fr-row" data-uid="${id}">
                    <div class="fr-av">${av}<span class="fr-dot ${isOnline?'on':'off'}"></span></div>
                    <div class="fr-body" onclick="chat.openProfileById('${id}')">
                      <div class="fr-name">${this._safe(ud.name||'User')}${pinned?'<i class="fa-solid fa-thumbtack fr-pin-badge" title="Pinned"></i>':''}</div>
                      <div class="fr-sub">@${this._safe(ud.username||id.slice(0,6))} · ${isOnline?'<span style="color:#10b981;">online</span>':'offline'}</div>
                    </div>
                    <button class="fr-act" title="Message" onclick="chat.openDM('${id}','${this._safe((ud.name||'').replace(/[\\'\"<>]/g,''))}')"><i class="fa-solid fa-comment"></i></button>
                    <button class="fr-act dots" title="More" onclick="chat._friendMenu(event,'${id}','${this._safe((ud.name||'').replace(/[\\'\"<>]/g,''))}',${pinned})"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                </div>`);
            }catch(e){}
        }
        grid.innerHTML = out.join('') || '<div class="empty-state">No friends</div>';
    },
    _friendMenu(ev, uid, name, isPinned){
        ev.stopPropagation();
        document.querySelectorAll('.fr-menu').forEach(m=>m.remove());
        const menu = document.createElement('div');
        menu.className = 'fr-menu';
        menu.innerHTML = `
            <button onclick="chat._closeFrMenu();chat.openDM('${uid}','${name}')"><i class="fa-solid fa-comment"></i> Message</button>
            <button onclick="chat._closeFrMenu();chat.openProfileById('${uid}')"><i class="fa-solid fa-user"></i> View Profile</button>
            <button onclick="chat._closeFrMenu();chat._togglePinFriend('${uid}')"><i class="fa-solid fa-thumbtack"></i> ${isPinned?'Unpin':'Pin to top'}</button>
            <button class="danger" onclick="chat._closeFrMenu();chat._removeFriend('${uid}')"><i class="fa-solid fa-user-minus"></i> Remove friend</button>
            <button class="danger" onclick="chat._closeFrMenu();chat._blockFriend('${uid}')"><i class="fa-solid fa-ban"></i> Block</button>
        `;
        document.body.appendChild(menu);
        const r = ev.currentTarget.getBoundingClientRect();
        const w = 170;
        menu.style.top = (r.bottom + 6) + 'px';
        menu.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
        setTimeout(()=>{ document.addEventListener('click', chat._closeFrMenu, {once:true}); }, 0);
    },
    _closeFrMenu(){ document.querySelectorAll('.fr-menu').forEach(m=>m.remove()); },
    async _togglePinFriend(uid){
        const pins = (window.db.user_data.pinnedFriends || []).slice();
        const has = pins.includes(uid);
        const next = has ? pins.filter(x=>x!==uid) : [uid, ...pins].slice(0,20);
        try{
            await updateDoc(doc(dbService,'users',window.db.user_uid),{pinnedFriends: next});
            window.db.user_data.pinnedFriends = next;
            ui.toast(has?'Unpinned':'Pinned');
            this._renderProfileFriends();
        }catch(e){ ui.toast('Error: '+e.message); }
    },
    async _removeFriend(uid){
        if(!confirm('Remove this friend?')) return;
        try{
            await updateDoc(doc(dbService,'users',window.db.user_uid),{friends: arrayRemove(uid)});
            await updateDoc(doc(dbService,'users',uid),{friends: arrayRemove(window.db.user_uid)}).catch(()=>{});
            window.db.user_data.friends = (window.db.user_data.friends||[]).filter(x=>x!==uid);
            ui.toast('Friend removed'); this.renderProfile();
        }catch(e){ ui.toast('Error: '+e.message); }
    },
    async _blockFriend(uid){
        if(!confirm('Block this user? They will be removed as friend and cannot message you.')) return;
        try{
            await updateDoc(doc(dbService,'users',window.db.user_uid),{
                friends: arrayRemove(uid),
                blockList: arrayUnion(uid)
            });
            await updateDoc(doc(dbService,'users',uid),{friends: arrayRemove(window.db.user_uid)}).catch(()=>{});
            window.db.user_data.friends = (window.db.user_data.friends||[]).filter(x=>x!==uid);
            window.db.user_data.blockList = [...((window.db.user_data.blockList)||[]), uid];
            ui.toast('User blocked'); this.renderProfile();
        }catch(e){ ui.toast('Error: '+e.message); }
    },
    scrollFriends(){ const el = document.getElementById('cp-friends-section'); if(el) el.scrollIntoView({behavior:'smooth'}); },
    openEditProfile(){
        const u = window.db.user_data || {};
        const av = u.photoURL ? `<img src="${u.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : ((u.name||'U')[0]||'U').toUpperCase();
        const isVer = u.isVerified;
        const priv = u.privacy || 'public';
        const html = `
          <div style="padding:6px 4px 20px;max-height:80vh;overflow-y:auto;">
            <div style="text-align:center;margin-bottom:18px;">
              <div style="position:relative;width:110px;height:110px;margin:0 auto;">
                <div style="width:110px;height:110px;border-radius:50%;background:var(--bg-input);display:flex;align-items:center;justify-content:center;font-size:2.4rem;font-weight:800;overflow:hidden;">${av}</div>
                <button onclick="chat.uploadProfileImage('avatar')" style="position:absolute;bottom:0;right:0;width:36px;height:36px;border-radius:50%;background:var(--primary);color:#fff;border:3px solid var(--bg-card);cursor:pointer;font-size:0.9rem;"><i class="fa-solid fa-camera"></i></button>
              </div>
            </div>
            <div style="font-weight:700;font-size:0.82rem;margin-bottom:6px;">App Name ${isVer?'<i class="fa-solid fa-circle-check" style="color:#1d9bf0;"></i>':''}</div>
            <input id="ep-name" value="${this._safe(u.name||'')}" placeholder="Your display name" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:12px;margin-bottom:14px;background:var(--bg-input);color:var(--text-main);box-sizing:border-box;">
            <div style="font-weight:700;font-size:0.82rem;margin-bottom:6px;">Username <span style="color:var(--text-muted);font-weight:400;font-size:0.72rem;">(5-20 chars, letters & numbers only)</span></div>
            <input id="ep-username" value="${this._safe(u.username||'')}" placeholder="username" maxlength="20" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:12px;margin-bottom:14px;background:var(--bg-input);color:var(--text-main);box-sizing:border-box;">
            <div style="font-weight:700;font-size:0.82rem;margin-bottom:6px;">Bio <span style="color:var(--text-muted);font-weight:400;font-size:0.72rem;">(max 100 words)</span></div>
            <textarea id="ep-bio" rows="3" maxlength="800" placeholder="Tell about yourself..." style="width:100%;padding:12px;border:1px solid var(--border);border-radius:12px;margin-bottom:6px;background:var(--bg-input);color:var(--text-main);resize:vertical;font-family:inherit;box-sizing:border-box;">${this._safe(u.bio||'')}</textarea>
            <div id="ep-wc" style="text-align:right;font-size:0.7rem;color:var(--text-muted);margin-bottom:14px;">0 / 100 words</div>

            <div style="font-weight:700;font-size:0.82rem;margin-bottom:8px;">Privacy</div>
            <div style="display:flex;gap:8px;margin-bottom:16px;">
              <div id="ep-card-pub" style="flex:1;padding:12px;border:2px solid ${priv==='public'?'var(--primary)':'var(--border)'};border-radius:12px;cursor:pointer;" onclick="chat._selectPriv('public')">
                <div style="font-weight:700;font-size:0.85rem;"><i class="fa-solid fa-globe"></i> Public</div>
                <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">Anyone can view profile, friends & DM directly.</div>
              </div>
              <div id="ep-card-pri" style="flex:1;padding:12px;border:2px solid ${priv==='private'?'var(--primary)':'var(--border)'};border-radius:12px;cursor:pointer;" onclick="chat._selectPriv('private')">
                <div style="font-weight:700;font-size:0.85rem;"><i class="fa-solid fa-lock"></i> Private</div>
                <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">Others must request. Details hidden.</div>
              </div>
            </div>
            <input type="hidden" id="ep-priv" value="${priv}">

            <button onclick="chat.openBlockList()" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--bg-input);color:var(--text-main);font-weight:700;cursor:pointer;margin-bottom:8px;"><i class="fa-solid fa-ban"></i> Blocked Users (${((u.blockList||[]).length)})</button>

            <div style="display:flex;gap:8px;margin-top:16px;">
              <button onclick="closeSheet()" style="flex:1;padding:14px;border:1px solid var(--border);border-radius:12px;background:transparent;color:var(--text-main);font-weight:700;cursor:pointer;">Cancel</button>
              <button onclick="chat._saveEditProfile()" style="flex:2;padding:14px;border:none;border-radius:12px;background:var(--primary);color:#fff;font-weight:800;cursor:pointer;">Save Changes</button>
            </div>
          </div>`;
        openSheet(html);
        const ta = document.getElementById('ep-bio'), wc = document.getElementById('ep-wc');
        const upd = () => {
            const w = (ta.value.trim().match(/\S+/g)||[]).length;
            wc.innerText = w+' / 100 words';
            wc.style.color = w>100 ? '#ef4444' : 'var(--text-muted)';
        };
        ta.addEventListener('input', upd); upd();
    },
    _selectPriv(v){
        document.getElementById('ep-priv').value = v;
        document.getElementById('ep-card-pub').style.borderColor = v==='public' ? 'var(--primary)' : 'var(--border)';
        document.getElementById('ep-card-pri').style.borderColor = v==='private' ? 'var(--primary)' : 'var(--border)';
    },
    async _saveEditProfile(){
        const name = document.getElementById('ep-name').value.trim();
        const username = document.getElementById('ep-username').value.trim().toLowerCase();
        const bio = document.getElementById('ep-bio').value.trim();
        const privacy = document.getElementById('ep-priv').value || 'public';
        if(!name){ ui.toast('Name required'); return; }
        if(!/^[a-z0-9]{5,20}$/.test(username)){ ui.toast('Username: 5-20 chars, letters & numbers only'); return; }
        if((bio.match(/\S+/g)||[]).length > 100){ ui.toast('Bio: max 100 words'); return; }
        try{
            const qU = query(collection(dbService,'users'), where('username','==',username), limit(2));
            const sU = await getDocs(qU);
            let taken = false;
            sU.forEach(d=>{ if(d.id !== window.db.user_uid) taken = true; });
            if(taken){ ui.toast('Username already taken'); return; }
        }catch(e){}
        try{
            const u = window.db.user_data || {};
            await updateDoc(doc(dbService,'users',window.db.user_uid),{
                name, username, bio, privacy,
                joinedAt: u.joinedAt || serverTimestamp()
            });
            Object.assign(window.db.user_data, {name, username, bio, privacy});
            window.db.user_name = name;
            closeSheet();
            this.renderProfile();
            ui.toast('Profile updated');
        }catch(e){ ui.toast('Error: '+e.message); }
    },
    async uploadProfileImage(kind){
        const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*';
        inp.onchange = async ()=>{
            const f = inp.files[0]; if(!f) return;
            if(!/^image\//.test(f.type)){ ui.toast('Only image files allowed'); return; }
            // Reject huge originals up front (before compress attempt)
            if(f.size > 15*1024*1024){ ui.toast('File too large (>15MB). Choose a smaller image.'); return; }
            ui.toast('Compressing...');
            let blob;
            try{
                blob = await chat._compressImage(f, kind==='cover' ? 1600 : 720, 500*1024);
            }catch(e){ ui.toast('Compression failed: '+e.message); return; }
            if(blob.size > 500*1024){ ui.toast('Image too heavy even after compress. Try a simpler picture.'); return; }
            ui.toast('Uploading...');
            try{
                const path = (kind==='cover'?'cover/':'profile/') + window.db.user_uid + '_' + Date.now() + '.jpg';
                const r = sRef(storageService, path);
                await uploadBytes(r, blob); const url = await getDownloadURL(r);
                const field = kind==='cover' ? 'coverURL' : 'photoURL';
                await updateDoc(doc(dbService,'users',window.db.user_uid),{[field]:url});
                window.db.user_data[field] = url; this.renderProfile();
                if(kind==='avatar' && document.getElementById('ep-name')) this.openEditProfile();
                ui.toast('Updated ('+ Math.round(blob.size/1024) +' KB)');
            }catch(e){ ui.toast('Upload error: '+e.message); }
        };
        inp.click();
    },
    // Canvas-based downscale + iterative JPEG quality until <= targetBytes (approx 500 KB).
    _compressImage(file, maxWidth, targetBytes){
        return new Promise((resolve, reject)=>{
            const img = new Image();
            const fr = new FileReader();
            fr.onload = e => { img.src = e.target.result; };
            fr.onerror = () => reject(new Error('Read failed'));
            img.onload = () => {
                let w = img.width, h = img.height;
                if(w > maxWidth){ h = Math.round(h * (maxWidth/w)); w = maxWidth; }
                const cv = document.createElement('canvas');
                cv.width = w; cv.height = h;
                cv.getContext('2d').drawImage(img, 0, 0, w, h);
                const tryQ = q => new Promise(r => cv.toBlob(r, 'image/jpeg', q));
                (async () => {
                    for(const q of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.28]){
                        const b = await tryQ(q);
                        if(b && b.size <= targetBytes){ resolve(b); return; }
                    }
                    // last resort: further shrink to 60% width
                    cv.width = Math.round(w*0.6); cv.height = Math.round(h*0.6);
                    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
                    const b = await tryQ(0.4);
                    resolve(b);
                })();
            };
            img.onerror = () => reject(new Error('Not an image'));
            fr.readAsDataURL(file);
        });
    },
    async openBlockList(){
        const b = (window.db.user_data||{}).blockList || [];
        if(!b.length){
            openSheet(`<div style="padding:30px 20px;text-align:center;color:var(--text-muted);"><i class="fa-solid fa-ban" style="font-size:2.4rem;margin-bottom:12px;opacity:.5;"></i><div style="font-weight:700;color:var(--text-main);">No blocked users</div><div style="font-size:0.8rem;margin-top:6px;">Blocked users can't message you or see your profile.</div></div>`);
            return;
        }
        openSheet('<div style="padding:14px;font-weight:800;font-size:1rem;"><i class="fa-solid fa-ban"></i> Blocked Users ('+b.length+')</div><div id="bl-list" style="padding:0 8px 20px;">Loading...</div>');
        const out = [];
        for(const id of b){
            try{
                const s = await getDoc(doc(dbService,'users',id));
                const ud = s.exists() ? s.data() : {name:'User'};
                const av = ud.photoURL ? `<img src="${ud.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : ((ud.name||'U')[0]||'U').toUpperCase();
                out.push(`<div class="friend-item">
                    <div class="fi-avatar">${av}</div>
                    <div class="fi-body"><div class="fi-name">${this._safe(ud.name||'User')}</div><div class="fi-sub">@${this._safe(ud.username||id.slice(0,8))}</div></div>
                    <button class="fi-action outline" onclick="chat.unblockUser('${id}')">Unblock</button>
                </div>`);
            }catch(e){}
        }
        const el = document.getElementById('bl-list'); if(el) el.innerHTML = out.join('');
    },
    async unblockUser(uid){
        await updateDoc(doc(dbService,'users',window.db.user_uid),{blockList: arrayRemove(uid)});
        window.db.user_data.blockList = (window.db.user_data.blockList||[]).filter(x=>x!==uid);
        ui.toast('Unblocked'); closeSheet();
    },
    openPrivacy(){ this.openEditProfile(); },
    openNotifications(){ ui.toast('Notifications coming'); },
});
