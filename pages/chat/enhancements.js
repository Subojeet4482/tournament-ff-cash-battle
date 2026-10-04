/**
 * Chat UX v2: action sheet, emoji react, swipe-reply, forward, banned words, group admin, music box.
 */
import { collection, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, addDoc, deleteDoc, serverTimestamp, onSnapshot, increment, dbService } from '../../js/core/firebase.js';

/* ============================================================
   ===== CHAT UX ENHANCEMENTS (v2) - Instagram/Telegram style =====
   Adds: bottom-sheet action menu, emoji quick-react, long-press,
   swipe-to-reply, forward, banned-word filter, group invite link,
   private groups, owner/admins/kick/promote, group music box.
   Non-destructive — extends window.chat. Rules updated separately.
   ============================================================ */
(function(){
  if(!window.chat){ console.warn('chat module missing'); return; }
  const C = window.chat;

  /* ---------- inject CSS ---------- */
  const css = `
  .cx-sheet-back{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;opacity:0;transition:.2s;display:none;}
  .cx-sheet-back.on{opacity:1;display:block;}
  .cx-sheet{position:fixed;left:0;right:0;bottom:0;background:var(--bg-card);border-radius:22px 22px 0 0;z-index:9999;padding:10px 14px 26px;transform:translateY(100%);transition:.25s cubic-bezier(.2,.9,.3,1);max-height:80vh;overflow-y:auto;}
  .cx-sheet.on{transform:translateY(0);}
  .cx-sheet-handle{width:38px;height:4px;background:var(--border);border-radius:99px;margin:6px auto 12px;}
  .cx-emoji-row{display:flex;justify-content:space-around;padding:6px 4px 12px;border-bottom:1px solid var(--border);margin-bottom:8px;}
  .cx-emoji{font-size:1.7rem;cursor:pointer;transition:.15s;padding:6px;border-radius:12px;}
  .cx-emoji:active{transform:scale(.85);background:var(--bg-input);}
  .cx-act{display:flex;align-items:center;gap:12px;padding:13px 8px;font-size:0.92rem;color:var(--text-main);border-radius:10px;cursor:pointer;}
  .cx-act:active{background:var(--bg-input);}
  .cx-act i{width:22px;text-align:center;color:var(--text-muted);}
  .cx-act.danger{color:var(--danger);} .cx-act.danger i{color:var(--danger);}
  .cx-act.admin{color:#f59e0b;} .cx-act.admin i{color:#f59e0b;}
  .msg-row{transition:transform .18s ease;touch-action:pan-y;}
  .msg-row.swiping{transition:none;}
  .msg-row .msg-swipe-hint{position:absolute;left:-30px;top:50%;transform:translateY(-50%);color:var(--primary);opacity:0;transition:.2s;}
  .msg-row.swipe-active .msg-swipe-hint{opacity:1;}
  .cx-music-box{background:linear-gradient(135deg,#4f46e5,#f43f5e);color:#fff;border-radius:14px;padding:10px 14px;margin:8px 12px;display:flex;align-items:center;gap:10px;box-shadow:0 4px 14px rgba(79,70,229,.25);}
  .cx-music-box .mb-ic{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;cursor:pointer;}
  .cx-music-box .mb-info{flex:1;min-width:0;}
  .cx-music-box .mb-title{font-weight:700;font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .cx-music-box .mb-sub{font-size:0.68rem;opacity:.85;}
  .cx-music-bar{height:3px;background:rgba(255,255,255,.25);border-radius:2px;margin-top:6px;overflow:hidden;}
  .cx-music-bar > span{display:block;height:100%;background:#fff;width:0%;transition:width .3s linear;}
  .cx-modal-back{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9997;display:flex;align-items:center;justify-content:center;padding:20px;}
  .cx-modal{background:var(--bg-card);border-radius:18px;padding:20px;max-width:340px;width:100%;}
  .cx-modal h3{font-size:1rem;font-weight:800;margin-bottom:12px;}
  .cx-modal .cx-input{width:100%;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-main);font-size:0.9rem;margin-bottom:10px;}
  .cx-modal .cx-toggle{display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg-input);border-radius:12px;margin-bottom:10px;font-size:0.85rem;}
  .cx-modal .cx-btn-row{display:flex;gap:8px;margin-top:6px;}
  .cx-modal .cx-btn{flex:1;padding:11px;border-radius:12px;font-weight:700;font-size:0.85rem;border:none;cursor:pointer;}
  .cx-btn.p{background:var(--primary);color:#fff;} .cx-btn.o{background:var(--bg-input);color:var(--text-main);}
  .cx-member{display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;}
  .cx-member:active{background:var(--bg-input);}
  .cx-role{font-size:0.65rem;padding:2px 8px;border-radius:99px;background:var(--primary-light);color:var(--primary);font-weight:700;}
  .cx-role.owner{background:#fef3c7;color:#b45309;}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---------- shared sheet ---------- */
  let _sheetEl, _backEl;
  function ensureSheet(){
    if(_sheetEl) return;
    _backEl = document.createElement('div'); _backEl.className='cx-sheet-back';
    _sheetEl = document.createElement('div'); _sheetEl.className='cx-sheet';
    document.body.appendChild(_backEl); document.body.appendChild(_sheetEl);
    _backEl.onclick = closeSheet;
  }
  function openSheet(html){
    ensureSheet();
    _sheetEl.innerHTML = '<div class="cx-sheet-handle"></div>'+html;
    requestAnimationFrame(()=>{ _backEl.classList.add('on'); _sheetEl.classList.add('on'); });
  }
  function closeSheet(){ if(!_sheetEl) return; _backEl.classList.remove('on'); _sheetEl.classList.remove('on'); setTimeout(()=>{ _backEl.style.display='none'; },220); setTimeout(()=>_backEl.style.display='',260); }
  C._closeSheet = closeSheet;
  window.openSheet = openSheet; window.closeSheet = closeSheet;
  Object.defineProperty(window, '_sheetEl', { get: ()=>_sheetEl, configurable: true });

  /* ---------- modal helpers ---------- */
  function openModal(inner){
    const b=document.createElement('div'); b.className='cx-modal-back';
    b.innerHTML = `<div class="cx-modal">${inner}</div>`;
    b.onclick=(e)=>{ if(e.target===b) b.remove(); };
    document.body.appendChild(b); return b;
  }
  C._openModal = openModal;

  /* ---------- banned words / chat cfg ---------- */
  window._chatCfg = { words:[], cooldown:2, maxLen:1000, mediaOn:true };
  async function loadCfg(){
    try{
      const [w,s] = await Promise.all([
        window.getDoc?window.getDoc(window.doc(window.dbService,'config','chat_words')):Promise.resolve(null),
        window.getDoc?window.getDoc(window.doc(window.dbService,'config','chat_settings')):Promise.resolve(null),
      ]);
    }catch(e){}
  }
  // safer: use imports available in outer scope via dynamic fetch
  (async ()=>{
    try{
      const ws = await getDoc(doc(dbService,'config','chat_words'));
      if(ws.exists()){ const d=ws.data(); window._chatCfg.words = (d.words||[]).map(x=>String(x).toLowerCase().trim()).filter(Boolean); }
    }catch(e){}
    try{
      const ss = await getDoc(doc(dbService,'config','chat_settings'));
      if(ss.exists()){ Object.assign(window._chatCfg, ss.data()); }
    }catch(e){}
    // live-listen so admin updates reflect immediately
    try{
      onSnapshot(doc(dbService,'config','chat_words'),(s)=>{ if(s.exists()){ const d=s.data(); window._chatCfg.words = (d.words||[]).map(x=>String(x).toLowerCase().trim()).filter(Boolean); } });
    }catch(e){}
  })();

  function hasBadWord(text){
    if(!text) return null;
    const t = String(text).toLowerCase();
    for(const w of (window._chatCfg.words||[])){
      if(!w) continue;
      // whole-word-ish: word boundary or contains for multi-word
      const re = new RegExp('(^|[^a-z0-9])'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z0-9]|$)','i');
      if(re.test(' '+t+' ')) return w;
    }
    return null;
  }

  /* ---------- override send funcs to filter ---------- */
  const _sendWorldOrig = C.sendWorld.bind(C);
  C.sendWorld = async function(){
    const inp = document.getElementById('wc-input'); const text = inp.value.trim(); if(!text) return;
    const bad = hasBadWord(text);
    if(bad){ ui.toast('Message blocked: contains banned word'); return; }
    if(window._chatCfg.maxLen && text.length>window._chatCfg.maxLen){ ui.toast('Too long'); return; }
    return _sendWorldOrig();
  };
  const _sendThreadOrig = C.sendThread.bind(C);
  C.sendThread = async function(){
    const inp = document.getElementById('th-input'); const text = inp.value.trim(); if(!text) return;
    const bad = hasBadWord(text);
    if(bad){ ui.toast('Message blocked: contains banned word'); return; }
    return _sendThreadOrig();
  };

  /* ---------- new msgMenu: bottom-sheet ---------- */
  const QUICK_EMOJI = ['❤️','😂','😮','😢','👍','🔥'];
  C.isAdmin = function(){
    const u = window.db.user_data || {};
    return !!(u.isAdmin || u.role==='admin' || (window.db.user_email==='chandanamandal4482@gmail.com'));
  };
  C.msgMenu = function(ctx, mid, isMe){
    const opts = [];
    opts.push({ic:'reply',lbl:'Reply',fn:()=>{ closeSheet(); const el=document.querySelector(`.msg-row[data-mid="${mid}"] .msg-text`); C.setReply(ctx==='world'?'wc':'th', mid, el?el.innerText:''); }});
    opts.push({ic:'share',lbl:'Forward',fn:()=>{ closeSheet(); C.openForward(ctx,mid); }});
    opts.push({ic:'copy',lbl:'Copy text',fn:()=>{ closeSheet(); const el=document.querySelector(`.msg-row[data-mid="${mid}"] .msg-text`); if(el){ navigator.clipboard.writeText(el.innerText).then(()=>ui.toast('Copied')); } }});
    const _row = document.querySelector(`.msg-row[data-mid="${mid}"]`);
    const _isDeleted = _row && _row.dataset.deleted === '1';
    const _isEdited  = _row && _row.dataset.edited === '1';
    if(isMe){
      // Edit only if not already edited and not deleted (delete-for-everyone locks edit)
      if(!_isDeleted && !_isEdited){
        opts.push({ic:'pen',lbl:'Edit',fn:()=>{ closeSheet(); C._editMsg(ctx,mid); }});
      }
      opts.push({ic:'eye-slash',lbl:'Delete for me',cls:'',fn:()=>{ closeSheet(); const el=document.querySelector(`.msg-row[data-mid="${mid}"]`); if(el) el.style.display='none'; }});
      if(!_isDeleted){
        opts.push({ic:'trash',lbl:'Delete for everyone',cls:'danger',fn:()=>{ closeSheet(); C._softDelete(ctx,mid); }});
      }
    } else {
      opts.push({ic:'flag',lbl:'Report',cls:'danger',fn:()=>{ closeSheet(); const r=prompt('Reason'); if(r){ addDoc(collection(dbService,'reports'),{type:'message',target:mid,ctx,reporter:window.db.user_uid,reason:r,createdAt:serverTimestamp(),status:'open'}).then(()=>ui.toast('Reported')); } }});
    }
    if(C.isAdmin()){
      opts.push({ic:'thumbtack',lbl:'Pin (admin)',cls:'admin',fn:()=>{ closeSheet(); C._adminPin(ctx,mid); }});
      opts.push({ic:'trash-can',lbl:'Hard delete (admin)',cls:'admin',fn:()=>{ closeSheet(); C._adminHardDel(ctx,mid); }});
    }
    const emojiRow = '<div class="cx-emoji-row">'+QUICK_EMOJI.map(e=>`<span class="cx-emoji" data-e="${e}">${e}</span>`).join('')+'</div>';
    const acts = opts.map((o,i)=>`<div class="cx-act ${o.cls||''}" data-i="${i}"><i class="fa-solid fa-${o.ic}"></i>${o.lbl}</div>`).join('');
    openSheet(emojiRow + acts);
    _sheetEl.querySelectorAll('.cx-emoji').forEach(el=>el.onclick=()=>{ C.toggleReaction(ctx,mid,el.dataset.e); closeSheet(); });
    _sheetEl.querySelectorAll('.cx-act').forEach(el=>el.onclick=()=>opts[+el.dataset.i].fn());
  };
  C._refDoc = function(ctx,mid){
    if(ctx==='world') return doc(dbService,'world_messages',mid);
    if(!C._thread) return null;
    if(C._thread.type==='dm') return doc(dbService,'chats',C._thread.id,'messages',mid);
    return doc(dbService,'groups',C._thread.id,'messages',mid);
  };
  C._editMsg = function(ctx,mid){ const el=document.querySelector(`.msg-row[data-mid="${mid}"] .msg-text`); const t=prompt('Edit:', el?el.innerText:''); if(t===null) return; const bad=hasBadWord(t); if(bad){ ui.toast('Contains banned word'); return; } const r=C._refDoc(ctx,mid); if(r) updateDoc(r,{text:t,edited:true}); };
  C._softDelete = function(ctx,mid){ const r=C._refDoc(ctx,mid); if(r) updateDoc(r,{deleted:true,text:''}).then(()=>ui.toast('Deleted')); };
  C._adminPin = function(ctx,mid){ const r=C._refDoc(ctx,mid); if(r) updateDoc(r,{pinned:true}).then(()=>ui.toast('Pinned')); };
  C._adminHardDel = function(ctx,mid){ if(!confirm('Permanently delete?')) return; const r=C._refDoc(ctx,mid); if(r) deleteDoc(r).then(()=>ui.toast('Deleted')); };

  /* ---------- Forward ---------- */
  C.openForward = async function(ctx, mid){
    const el = document.querySelector(`.msg-row[data-mid="${mid}"] .msg-text`);
    const text = el?el.innerText:'';
    const ids = (window.db.user_data||{}).friends || [];
    let items = '<div style="padding:6px 0;font-weight:800;">Forward to...</div>';
    if(!ids.length){ items += '<div style="padding:20px;text-align:center;color:var(--text-muted);">No friends</div>'; openSheet(items); return; }
    const rows = await Promise.all(ids.map(id=>getDoc(doc(dbService,'users',id))));
    items += rows.filter(s=>s.exists()).map(s=>{ const u=s.data(); return `<div class="cx-act" data-fw="${s.id}"><div class="fi-avatar" style="width:34px;height:34px;">${u.photoURL?`<img src="${u.photoURL}">`:(u.name||'U')[0].toUpperCase()}</div>${u.name||'User'}</div>`; }).join('');
    openSheet(items);
    _sheetEl.querySelectorAll('[data-fw]').forEach(el=>el.onclick=async ()=>{
      const peer = el.dataset.fw;
      const cid = C._chatId(window.db.user_uid, peer);
      try{
        await setDoc(doc(dbService,'chats',cid),{members:[window.db.user_uid,peer].sort(),createdAt:serverTimestamp()},{merge:true});
        await addDoc(collection(dbService,'chats',cid,'messages'),{uid:window.db.user_uid,name:window.db.user_name||'User',text:'↪️ '+text,type:'text',forwarded:true,createdAt:serverTimestamp()});
        ui.toast('Forwarded'); closeSheet();
      }catch(e){ ui.toast(e.message); }
    });
  };

  /* ---------- gestures: long-press + swipe-to-reply ---------- */
  function bindGestures(box, ctx){
    if(!box || box._cxBound) return; box._cxBound=true;
    let sx=0, sy=0, sid=null, lpTimer=null, moved=false, row=null;
    box.addEventListener('touchstart',(e)=>{
      row = e.target.closest('.msg-row'); if(!row) return;
      const t = e.touches[0]; sx=t.clientX; sy=t.clientY; moved=false;
      sid = row.dataset.mid;
      lpTimer = setTimeout(()=>{
        if(!moved && sid){ const isMe = row.classList.contains('me'); if(navigator.vibrate) navigator.vibrate(20); C.msgMenu(ctx, sid, isMe); }
      }, 450);
    },{passive:true});
    box.addEventListener('touchmove',(e)=>{
      if(!row) return; const t=e.touches[0]; const dx=t.clientX-sx, dy=t.clientY-sy;
      if(Math.abs(dx)>6 || Math.abs(dy)>6) { moved=true; clearTimeout(lpTimer); }
      if(dx>10 && Math.abs(dy)<40){
        row.classList.add('swiping');
        const tx = Math.min(dx, 80);
        row.style.transform = 'translateX('+tx+'px)';
        if(tx>60) row.classList.add('swipe-active'); else row.classList.remove('swipe-active');
      }
    },{passive:true});
    box.addEventListener('touchend',(e)=>{
      clearTimeout(lpTimer);
      if(!row) return;
      const trig = row.classList.contains('swipe-active');
      row.classList.remove('swiping','swipe-active');
      row.style.transform='';
      if(trig && sid){ const el=row.querySelector('.msg-text'); C.setReply(ctx==='world'?'wc':'th', sid, el?el.innerText:''); }
      row=null; sid=null;
    },{passive:true});
  }
  // After each render (streams overwrite innerHTML) re-bind via MutationObserver
  function watchAndBind(id, ctx){
    const el = document.getElementById(id); if(!el) return;
    bindGestures(el, ctx);
    new MutationObserver(()=>bindGestures(el, ctx)).observe(el,{childList:true});
  }
  document.addEventListener('DOMContentLoaded',()=>{
    watchAndBind('wc-messages','world');
    watchAndBind('th-messages','thread');
  });
  // if page already loaded:
  if(document.readyState!=='loading'){ watchAndBind('wc-messages','world'); watchAndBind('th-messages','thread'); }

  /* ---------- Groups: new create modal (public/private) ---------- */
  C.openNewGroup = function(){
    const m = openModal(`
      <h3><i class="fa-solid fa-users"></i> Create Group</h3>
      <input class="cx-input" id="ng-name" placeholder="Group name" maxlength="40">
      <input class="cx-input" id="ng-desc" placeholder="Description (optional)" maxlength="120">
      <label class="cx-toggle"><input type="checkbox" id="ng-public"> <span>Public — anyone can find & join</span></label>
      <div class="cx-btn-row">
        <button class="cx-btn o" id="ng-cancel">Cancel</button>
        <button class="cx-btn p" id="ng-create">Create</button>
      </div>
    `);
    m.querySelector('#ng-cancel').onclick=()=>m.remove();
    m.querySelector('#ng-create').onclick=async ()=>{
      const name = m.querySelector('#ng-name').value.trim();
      const desc = m.querySelector('#ng-desc').value.trim();
      const pub  = m.querySelector('#ng-public').checked;
      if(!name){ ui.toast('Name required'); return; }
      try{
        const r = await addDoc(collection(dbService,'groups'),{
          name, desc, ownerUid: window.db.user_uid, admins:[], members:[window.db.user_uid],
          memberCount:1, public:pub, createdAt: serverTimestamp()
        });
        ui.toast('Group created'); m.remove(); C.openGroup(r.id, name);
      }catch(e){ ui.toast(e.message); }
    };
  };

  /* ---------- Group invite link ---------- */
  C.copyInviteLink = function(gid){
    const url = location.origin + location.pathname + '?joinGroup=' + gid;
    navigator.clipboard.writeText(url).then(()=>ui.toast('Invite link copied')).catch(()=>{ prompt('Copy invite link:', url); });
  };
  C.shareInviteLink = function(gid, gname){
    const url = location.origin + location.pathname + '?joinGroup=' + gid;
    if(navigator.share){ navigator.share({title:gname||'Join group', text:'Join our chat group', url}).catch(()=>{}); }
    else C.copyInviteLink(gid);
  };
  // auto-join via URL param
  async function tryAutoJoin(){
    const p = new URLSearchParams(location.search).get('joinGroup');
    if(!p || !window.db.user_uid) return;
    try{
      const s = await getDoc(doc(dbService,'groups',p));
      if(!s.exists()){ ui.toast('Group not found'); return; }
      const g = s.data();
      if(!(g.members||[]).includes(window.db.user_uid)){
        await updateDoc(doc(dbService,'groups',p),{members: arrayUnion(window.db.user_uid), memberCount: increment(1)});
      }
      // clean URL
      history.replaceState(null,'', location.pathname);
      ui.toast('Joined '+(g.name||'group'));
      if(window.nav && window.nav.goto){ window.nav.goto('chat', document.querySelectorAll('.nav-item')[2]); setTimeout(()=>C.openGroup(p,g.name), 400); }
    }catch(e){ ui.toast(e.message); }
  }
  // hook after auth ready
  const _pollJoin = setInterval(()=>{ if(window.db && window.db.user_uid){ clearInterval(_pollJoin); tryAutoJoin(); } }, 800);

  /* ---------- Group thread menu: roles/kick/music ---------- */
  const _threadMenuOrig = C.threadMenu.bind(C);
  C.threadMenu = async function(){
    if(!C._thread){ return; }
    if(C._thread.type!=='group'){ return _threadMenuOrig(); }
    const gs = await getDoc(doc(dbService,'groups',C._thread.id)); if(!gs.exists()) return;
    const g = gs.data(); const me = window.db.user_uid;
    const isOwner = g.ownerUid===me; const isAdm = isOwner || (g.admins||[]).includes(me);
    const acts = [
      {ic:'users',lbl:'Members',fn:()=>{ closeSheet(); C.openMembers(C._thread.id); }},
      {ic:'link',lbl:'Copy invite link',fn:()=>{ closeSheet(); C.copyInviteLink(C._thread.id); }},
      {ic:'share-nodes',lbl:'Share invite',fn:()=>{ closeSheet(); C.shareInviteLink(C._thread.id, g.name); }},
      {ic:'music',lbl:'Add song to music box',fn:()=>{ closeSheet(); C.openAddSong(C._thread.id); }},
    ];
    if(isAdm){
      acts.push({ic:'sliders',lbl:(g.public?'Make private':'Make public'),cls:'admin',fn:async()=>{ closeSheet(); try{ await updateDoc(doc(dbService,'groups',C._thread.id),{public:!g.public}); ui.toast('Updated'); }catch(e){ui.toast(e.message);} }});
    }
    if(!isOwner) acts.push({ic:'right-from-bracket',lbl:'Leave group',cls:'danger',fn:async ()=>{ closeSheet(); if(!confirm('Leave group?')) return; try{ await updateDoc(doc(dbService,'groups',C._thread.id),{members:arrayRemove(me), admins:arrayRemove(me), memberCount:increment(-1)}); ui.toast('Left'); C.closeThread(); }catch(e){ui.toast(e.message);} }});
    if(isOwner) acts.push({ic:'trash',lbl:'Delete group',cls:'danger',fn:async()=>{ closeSheet(); if(!confirm('Delete group forever?')) return; try{ await deleteDoc(doc(dbService,'groups',C._thread.id)); ui.toast('Deleted'); C.closeThread(); }catch(e){ui.toast(e.message);} }});
    openSheet(acts.map((a,i)=>`<div class="cx-act ${a.cls||''}" data-i="${i}"><i class="fa-solid fa-${a.ic}"></i>${a.lbl}</div>`).join(''));
    _sheetEl.querySelectorAll('.cx-act').forEach(el=>el.onclick=()=>acts[+el.dataset.i].fn());
  };

  C.openMembers = async function(gid){
    const gs = await getDoc(doc(dbService,'groups',gid)); if(!gs.exists()) return;
    const g = gs.data(); const me=window.db.user_uid; const isOwner=g.ownerUid===me; const isAdm=isOwner||(g.admins||[]).includes(me);
    const memberIds = g.members||[];
    const rows = await Promise.all(memberIds.map(id=>getDoc(doc(dbService,'users',id)).catch(()=>null)));
    const list = rows.filter(x=>x&&x.exists()).map(s=>{
      const u=s.data(); const uid=s.id;
      const roleLbl = uid===g.ownerUid?'<span class="cx-role owner">Owner</span>' : (g.admins||[]).includes(uid)?'<span class="cx-role">Admin</span>':'';
      let ctrls='';
      if(isAdm && uid!==me && uid!==g.ownerUid){
        if(isOwner){
          ctrls = (g.admins||[]).includes(uid)
            ? `<button class="cx-btn o" data-demote="${uid}" style="padding:6px 10px;font-size:0.72rem;">Demote</button>`
            : `<button class="cx-btn o" data-promote="${uid}" style="padding:6px 10px;font-size:0.72rem;">Make admin</button>`;
        }
        ctrls += `<button class="cx-btn o" data-kick="${uid}" style="padding:6px 10px;font-size:0.72rem;color:var(--danger);">Kick</button>`;
      }
      return `<div class="cx-member">
        <div class="fi-avatar" style="width:38px;height:38px;">${u.photoURL?`<img src="${u.photoURL}">`:(u.name||'U')[0].toUpperCase()}</div>
        <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:0.85rem;">${u.name||'User'} ${roleLbl}</div><div style="font-size:0.7rem;color:var(--text-muted);">@${u.username||uid.slice(0,8)}</div></div>
        <div style="display:flex;gap:6px;">${ctrls}</div>
      </div>`;
    }).join('');
    openSheet(`<div style="font-weight:800;padding:4px 8px 10px;">Members (${memberIds.length})</div>`+list);
    _sheetEl.querySelectorAll('[data-kick]').forEach(el=>el.onclick=async ()=>{ const uid=el.dataset.kick; if(!confirm('Kick this user?')) return; try{ await updateDoc(doc(dbService,'groups',gid),{members:arrayRemove(uid), admins:arrayRemove(uid), memberCount:increment(-1)}); ui.toast('Kicked'); closeSheet(); }catch(e){ui.toast(e.message);} });
    _sheetEl.querySelectorAll('[data-promote]').forEach(el=>el.onclick=async ()=>{ try{ await updateDoc(doc(dbService,'groups',gid),{admins:arrayUnion(el.dataset.promote)}); ui.toast('Promoted'); closeSheet(); }catch(e){ui.toast(e.message);} });
    _sheetEl.querySelectorAll('[data-demote]').forEach(el=>el.onclick=async ()=>{ try{ await updateDoc(doc(dbService,'groups',gid),{admins:arrayRemove(el.dataset.demote)}); ui.toast('Demoted'); closeSheet(); }catch(e){ui.toast(e.message);} });
  };

  /* ---------- Group Music Box ---------- */
  C.openAddSong = function(gid){
    const m = openModal(`
      <h3><i class="fa-solid fa-music"></i> Add song</h3>
      <input class="cx-input" id="as-title" placeholder="Song title" maxlength="80">
      <input class="cx-input" id="as-url" placeholder="Direct audio URL (.mp3)" >
      <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:8px;">Paste a public MP3/audio URL. Everyone in the group can play it.</div>
      <div class="cx-btn-row">
        <button class="cx-btn o" id="as-cancel">Cancel</button>
        <button class="cx-btn p" id="as-play">Play now</button>
      </div>
    `);
    m.querySelector('#as-cancel').onclick=()=>m.remove();
    m.querySelector('#as-play').onclick=async ()=>{
      const title = m.querySelector('#as-title').value.trim() || 'Untitled';
      const url = m.querySelector('#as-url').value.trim();
      if(!/^https?:\/\//.test(url)){ ui.toast('Enter valid URL'); return; }
      try{
        await updateDoc(doc(dbService,'groups',gid),{ nowPlaying:{ url, title, by: window.db.user_name||'User', byUid: window.db.user_uid, startAt: Date.now() } });
        ui.toast('Playing'); m.remove();
      }catch(e){ ui.toast(e.message); }
    };
  };

  // render music box on group thread open
  let _mbUnsub=null, _mbAudio=null;
  const _openGroupOrig = C.openGroup.bind(C);
  C.openGroup = async function(gid, gname){
    await _openGroupOrig(gid, gname);
    if(_mbUnsub){ try{_mbUnsub();}catch(e){} _mbUnsub=null; }
    const body = document.getElementById('th-messages');
    let mb = document.getElementById('cx-mb'); if(mb) mb.remove();
    mb = document.createElement('div'); mb.id='cx-mb'; mb.className='cx-music-box'; mb.style.display='none';
    body.parentNode.insertBefore(mb, body);
    _mbUnsub = onSnapshot(doc(dbService,'groups',gid),(s)=>{
      if(!s.exists()) return; const g=s.data(); const np=g.nowPlaying;
      if(!np||!np.url){ mb.style.display='none'; if(_mbAudio){_mbAudio.pause(); _mbAudio=null;} return; }
      mb.style.display='flex';
      mb.innerHTML = `<div class="mb-ic" id="mb-play"><i class="fa-solid fa-play"></i></div>
        <div class="mb-info"><div class="mb-title">${(np.title||'Untitled').replace(/[<>&]/g,'')}</div><div class="mb-sub">Added by ${(np.by||'someone').replace(/[<>&]/g,'')}</div><div class="cx-music-bar"><span id="mb-bar"></span></div></div>
        <div class="mb-ic" id="mb-stop" title="Stop for me"><i class="fa-solid fa-xmark"></i></div>`;
      const btn = mb.querySelector('#mb-play'); const bar = mb.querySelector('#mb-bar');
      btn.onclick = ()=>{
        if(_mbAudio && !_mbAudio.paused){ _mbAudio.pause(); btn.innerHTML='<i class="fa-solid fa-play"></i>'; return; }
        if(!_mbAudio || _mbAudio._src!==np.url){ if(_mbAudio) _mbAudio.pause(); _mbAudio = new Audio(np.url); _mbAudio._src=np.url;
          _mbAudio.ontimeupdate = ()=>{ if(_mbAudio.duration) bar.style.width = (100*_mbAudio.currentTime/_mbAudio.duration)+'%'; };
          _mbAudio.onended = ()=>{ btn.innerHTML='<i class="fa-solid fa-play"></i>'; bar.style.width='0%'; };
        }
        _mbAudio.play().then(()=>btn.innerHTML='<i class="fa-solid fa-pause"></i>').catch(e=>ui.toast('Play blocked: '+e.message));
      };
      mb.querySelector('#mb-stop').onclick = ()=>{ if(_mbAudio){_mbAudio.pause(); _mbAudio=null;} mb.style.display='none'; };
    });
  };
  const _closeThreadOrig = C.closeThread.bind(C);
  C.closeThread = function(){ if(_mbUnsub){try{_mbUnsub();}catch(e){} _mbUnsub=null;} if(_mbAudio){_mbAudio.pause(); _mbAudio=null;} const mb=document.getElementById('cx-mb'); if(mb) mb.remove(); _closeThreadOrig(); };

  console.log('[chat-enhance v2] loaded');
})();
