/**
 * Chat fixes + motion logic (loaded after enhancements.js).
 * Fixes: broken sheets/profile edit (globals), composer scrolling away, message list flicker
 * + wrong scroll box, thread header (avatar/online/status), back-navigation, profile friends
 * flicker (presence re-render), missing sendFriendRequest, per-keystroke search queries,
 * slow sequential loads, XSS in names.
 */
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, onSnapshot, dbService } from '../../js/core/firebase.js';

(function(){
  const C = window.chat; if(!C){ console.warn('[chat-fixes] chat missing'); return; }
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const attr = (s) => String(s || '').replace(/[\\'"<>&`]/g, '');
  const replay = (el, cls) => { if(!el) return; el.classList.remove('sub-in','sub-out'); void el.offsetWidth; el.classList.add(cls); clearTimeout(el._rpT); el._rpT = setTimeout(()=>el.classList.remove(cls), 600); };
  const setHtml = (el, h) => { if(!el || el._h === h) return; el._h = h; el.innerHTML = h; };
  const EMPTY = (ic, t, s) => `<div class="empty-state"><i class="fa-solid fa-${ic}"></i><div style="font-weight:700;color:var(--text-main);">${t}</div>${s ? `<div style="font-size:.78rem;margin-top:4px;">${s}</div>` : ''}</div>`;
  C._empty = EMPTY;
  C._skelMsgs = () => [0,1,2,3,4].map(i => `<div class="msg-skel ${i%2?'me':''}"><div class="sk av"></div><div class="sk bub" style="width:${40+((i*17)%35)}%"></div></div>`).join('');
  C._skelRows = (n = 4) => Array.from({length:n}, () => '<div class="sk-row"><div class="sk c"></div><div style="flex:1"><div class="sk l"></div><div class="sk s"></div></div></div>').join('');

  /* ---------- user doc cache (stops repeated reads on every presence tick) ---------- */
  const uCache = new Map();
  C._getUser = async (id, maxAge = 30000) => {
    const c = uCache.get(id); if(c && Date.now() - c.t < maxAge) return c.d;
    try{ const s = await getDoc(doc(dbService, 'users', id)); const d = s.exists() ? s.data() : null; uCache.set(id, {t:Date.now(), d}); return d; }
    catch(e){ return c ? c.d : null; }
  };
  const isOn = (id, u) => (window.presence && window.presence.isOnline) ? window.presence.isOnline(id, u) : !!(u && u.online);
  const avHtml = (u, id) => u && u.photoURL ? `<img src="${esc(u.photoURL)}" alt="">` : esc(((u && u.name) || 'U')[0].toUpperCase());

  /* ---------- hub + navigation (animated, remembers where you came from) ---------- */
  C.openSub = function(name){
    const v = $('chat-sub-' + name); if(!v) return;
    $('chat-hub').classList.add('hidden');
    document.querySelectorAll('#page-chat .chat-sub-view').forEach(x => x.classList.add('hidden'));
    v.classList.remove('hidden'); v.scrollTop = 0; replay(v, 'sub-in');
    $('page-chat').classList.add('in-sub');
    const first = v.querySelector('.chat-tab');
    if(name === 'profile') this.renderProfile();
    if(name === 'world')   this.streamWorld();
    if(name === 'search'){ this.setFsTab('results', first); const r = $('fs-results'); if(r && !r.children.length) $('fs-input').dispatchEvent(new Event('input')); this.loadRequests(); }
    if(name === 'friends'){ this.setFcTab('dm', first); this.streamFriends(); }
    if(name === 'discover') this.setDcTab('trending', first);
  };
  C.backToHub = function(){
    document.querySelectorAll('#page-chat .chat-sub-view').forEach(x => x.classList.add('hidden'));
    const h = $('chat-hub'); h.classList.remove('hidden'); replay(h, 'sub-out');
    $('page-chat').classList.remove('in-sub');
    this._stopStreams(); this._refreshHub();
  };
  C._refreshHub = async function(){
    const u = window.db.user_data || {}, av = $('ch-av'), hi = $('ch-hi'); if(!av) return;
    const nm = u.name || window.db.user_name || 'Player';
    hi.textContent = 'Hey, ' + nm + ' 👋'; av.innerHTML = avHtml({photoURL:u.photoURL, name:nm});
    if(!window.db.user_uid) return;
    try{
      const s = await getDocs(query(collection(dbService, 'friend_requests'), where('to', '==', window.db.user_uid), where('status', '==', 'pending')));
      const b = $('hub-req-badge'); b.textContent = s.size > 9 ? '9+' : s.size; b.classList.toggle('hidden', !s.size);
    }catch(e){}
  };
  const _onOpen = C.onOpen.bind(C);
  C.onOpen = function(){
    $('page-chat').classList.toggle('in-sub', !!document.querySelector('#page-chat .chat-sub-view:not(.hidden)'));
    this._refreshHub(); return _onOpen();
  };
  // leaving the chat tab: stop live listeners (they kept running in the background)
  if(window.nav && window.nav.renderPage && !window.nav._chatFix){
    const o = window.nav.renderPage;
    window.nav.renderPage = function(p){ if(p !== 'chat'){ try{ C._stopStreams(); }catch(e){} const pg = $('page-chat'); if(pg) pg.classList.remove('in-sub'); } return o.apply(this, arguments); };
    window.nav._chatFix = true;
  }

  /* ---------- smart message list: animate only NEW messages, keep scroll, scroll the right box ---------- */
  C._renderList = function(box, items, ctx, emptyHtml){
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160, prev = box.scrollTop;
    const first = !box._init, seen = box._seen || (box._seen = new Set());
    box.innerHTML = items.map(m => C._renderMsg(m, ctx)).join('') || emptyHtml;
    const rows = box.querySelectorAll('.msg-row');
    if(first){ [...rows].slice(-8).forEach((r, i) => { r.classList.add('msg-new'); r.style.animationDelay = (i * 0.04) + 's'; }); }
    else rows.forEach(r => { if(!seen.has(r.dataset.mid)) r.classList.add('msg-new'); });
    items.forEach(m => seen.add(m.id)); box._init = true;
    const last = items[items.length - 1], stick = first || nearBottom || (last && last.uid === window.db.user_uid);
    box.scrollTop = stick ? box.scrollHeight : prev;
    if(stick) box.querySelectorAll('.msg-img').forEach(im => { if(!im.complete) im.addEventListener('load', () => { box.scrollTop = box.scrollHeight; }, {once:true}); });
  };
  C.streamWorld = function(){
    if(C._unsubs.world){ try{ C._unsubs.world(); }catch(e){} }
    const box = $('wc-messages'), pb = $('wc-pinned'); box._init = false; box._seen = null; box.innerHTML = C._skelMsgs(); pb.classList.add('hidden');
    C._unsubs.world = onSnapshot(query(collection(dbService, 'world_messages'), orderBy('createdAt', 'desc'), limit(80)), (s) => {
      const items = []; s.forEach(d => items.push({id:d.id, ...d.data()})); items.reverse();
      C._renderList(box, items, 'world', EMPTY('comments', 'Be the first to say hi', 'World chat is open to everyone 🌍'));
      const pinned = items.filter(m => m.pinned && !m.deleted);
      if(pinned.length){ const p = pinned[pinned.length - 1]; pb.classList.remove('hidden'); pb.innerHTML = '<i class="fa-solid fa-thumbtack"></i> <b>Pinned:</b> ' + C._safe(p.text || p.fileName || '[media]'); }
      else pb.classList.add('hidden');
    }, (err) => { box.innerHTML = EMPTY('triangle-exclamation', 'Could not load messages', esc(err.message)); });
  };
  C._streamThread = function(path){
    if(C._unsubs.thread){ try{ C._unsubs.thread(); }catch(e){} }
    const box = $('th-messages'); box._init = false; box._seen = null; box.innerHTML = C._skelMsgs();
    C._unsubs.thread = onSnapshot(query(collection(dbService, ...path.split('/')), orderBy('createdAt', 'desc'), limit(100)), (s) => {
      const items = []; s.forEach(d => items.push({id:d.id, ...d.data()})); items.reverse();
      C._renderList(box, items, 'thread', EMPTY('comment-dots', 'Say hi 👋', 'Start the conversation'));
    }, (err) => { box.innerHTML = EMPTY('triangle-exclamation', 'Could not load chat', esc(err.message)); });
  };

  /* ---------- thread: header avatar / online / status, and return to where you came from ---------- */
  const fmtSeen = (u) => {
    if(!u || !u.lastSeen || !u.lastSeen.seconds) return 'offline';
    const d = new Date(u.lastSeen.seconds * 1000), t = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    return 'last seen ' + (d.toDateString() === new Date().toDateString() ? 'today ' + t : d.toLocaleDateString([], {day:'numeric', month:'short'}) + ' ' + t);
  };
  C._decorateThread = function(kind, id, name){
    const av = $('th-avatar'), st = $('th-status'), peer = $('th-peer');
    const set = (u) => { av.innerHTML = avHtml(u || {name}) + '<span class="th-online-dot"></span>'; };
    if(C._unsubs.peer){ try{ C._unsubs.peer(); }catch(e){} delete C._unsubs.peer; }
    set(null); peer.classList.remove('online'); st.className = 'th-status-lbl';
    if(kind === 'group'){ st.textContent = 'Group · tap for members'; return; }
    st.textContent = '';
    C._unsubs.peer = onSnapshot(doc(dbService, 'users', id), (s) => {
      if(!s.exists()) return; const u = s.data(), on = isOn(id, u);
      set(u); peer.classList.toggle('online', on); st.textContent = on ? 'online' : fmtSeen(u);
      if(u.name) $('th-name').textContent = u.name;
    });
  };
  const _openDM = C.openDM.bind(C), _openGroup = C.openGroup.bind(C);
  const noteFrom = () => {
    if(!$('chat-sub-thread').classList.contains('hidden')) return;
    const v = [...document.querySelectorAll('#page-chat .chat-sub-view')].find(x => !x.classList.contains('hidden'));
    C._threadFrom = v ? v.id.replace('chat-sub-', '') : 'friends';
  };
  const enter = () => { $('chat-hub').classList.add('hidden'); $('page-chat').classList.add('in-sub'); };
  C.openDM = async function(uid, name){ noteFrom(); enter(); await _openDM(uid, name); C._decorateThread('dm', uid, name); replay($('chat-sub-thread'), 'sub-in'); };
  C.openGroup = async function(gid, name){ noteFrom(); enter(); await _openGroup(gid, name); C._decorateThread('group', gid, name); replay($('chat-sub-thread'), 'sub-in'); };
  const _closeThread = C.closeThread.bind(C);
  C.closeThread = function(){
    if(C._unsubs.peer){ try{ C._unsubs.peer(); }catch(e){} delete C._unsubs.peer; }
    const to = C._threadFrom; C._threadFrom = null; _closeThread();
    if(to && to !== 'friends' && $('chat-sub-' + to)){ $('chat-sub-friends').classList.add('hidden'); C.openSub(to); }
    else { replay($('chat-sub-friends'), 'sub-out'); C.loadFriends(); }
  };

  /* ---------- friend requests: missing alias, duplicate guard, instant button feedback ---------- */
  const _sendReq = C.sendRequest.bind(C);
  C.sendRequest = async function(uid){
    const u = window.db.user_data || {};
    if((u.friends || []).includes(uid)){ ui.toast('Already friends'); return; }
    if((u.outgoingReq || []).includes(uid)){ ui.toast('Request already sent'); return; }
    await _sendReq(uid);
    if((window.db.user_data.outgoingReq || []).includes(uid)) document.querySelectorAll(`[onclick="chat.sendRequest('${uid}')"]`).forEach(b => {
      b.removeAttribute('onclick'); b.textContent = 'Sent ✓'; b.className = 'fi-action outline done'; b.disabled = true;
    });
  };
  C.sendFriendRequest = (uid) => C.sendRequest(uid);   // profile card "Add" called this and it did not exist
  const _search = C.searchUsers.bind(C); let _sT;
  C.searchUsers = function(q){ clearTimeout(_sT); const v = (q || '').trim(); if(v.length < 2) return _search(q); _sT = setTimeout(() => _search(q), 320); };

  /* ---------- friends list: parallel loads, skeleton, escaped, online dot from presence ---------- */
  C.loadFriends = async function(){
    const box = $('fc-dm'); if(!box) return;
    const me = window.db.user_data || {}, ids = (me.friends || []).slice(), pins = me.pinnedFriends || [];
    if(!ids.length){ setHtml(box, EMPTY('user-plus', 'No friends yet', 'Add friends from Find Friend')); return; }
    if(!box.children.length){ box._h = null; box.innerHTML = C._skelRows(Math.min(ids.length, 5)); }
    ids.sort((a, b) => (pins.includes(a) ? 0 : 1) - (pins.includes(b) ? 0 : 1));
    const rows = await Promise.all(ids.map(async (id) => {
      const ud = await C._getUser(id, 10000); if(!ud) return '';
      let last = '';
      try{
        const ls = await getDocs(query(collection(dbService, 'chats', C._chatId(window.db.user_uid, id), 'messages'), orderBy('createdAt', 'desc'), limit(1)));
        ls.forEach(d => { const m = d.data(); last = m.deleted ? 'Message deleted' : (m.text || ('[' + (m.type || 'media') + ']')); });
      }catch(e){}
      return `<div class="friend-item" onclick="chat.openDM('${id}','${attr(ud.name)}')">
        <div class="fi-avatar">${avHtml(ud)}</div>
        <div class="fi-body"><div class="fi-name">${esc(ud.name || 'User')} ${isOn(id, ud) ? '<span class="fi-online-dot"></span>' : ''}${pins.includes(id) ? '<i class="fa-solid fa-thumbtack fr-pin-badge"></i>' : ''}</div><div class="fi-sub">${esc(last) || 'Say hi 👋'}</div></div>
      </div>`;
    }));
    setHtml(box, rows.join('') || EMPTY('comments', 'No chats yet'));
  };

  /* ---------- own profile: friends strip (was flickering "Loading..." on every presence tick) ---------- */
  let _pfT;
  C._renderProfileFriends = function(){ clearTimeout(_pfT); _pfT = setTimeout(() => C._doProfileFriends(), 250); };
  C._doProfileFriends = async function(){
    const grid = $('cp-friends-grid'), cnt = $('cp-friends-count'); if(!grid) return;
    const me = window.db.user_data || {}, ids = (me.friends || []).slice(), pins = me.pinnedFriends || [];
    if(cnt) cnt.textContent = '(' + ids.length + ')';
    if(!ids.length){ setHtml(grid, EMPTY('user-group', 'No friends yet', 'Search &amp; add friends to start chatting')); return; }
    if(!grid.children.length){ grid._h = null; grid.innerHTML = C._skelRows(Math.min(ids.length, 3)); }
    ids.sort((a, b) => (pins.includes(a) ? 0 : 1) - (pins.includes(b) ? 0 : 1));
    const rows = await Promise.all(ids.slice(0, 80).map(async (id) => {
      const ud = await C._getUser(id); if(!ud) return '';
      const on = isOn(id, ud), pinned = pins.includes(id), nm = attr(ud.name);
      return `<div class="fr-row" data-uid="${id}">
        <div class="fr-av">${avHtml(ud)}<span class="fr-dot ${on ? 'on' : 'off'}"></span></div>
        <div class="fr-body" onclick="chat.openProfileById('${id}')">
          <div class="fr-name">${esc(ud.name || 'User')}${pinned ? '<i class="fa-solid fa-thumbtack fr-pin-badge" title="Pinned"></i>' : ''}</div>
          <div class="fr-sub">@${esc(ud.username || id.slice(0, 6))} · ${on ? '<span style="color:#10b981;">online</span>' : 'offline'}</div>
        </div>
        <button class="fr-act" title="Message" onclick="chat.openDM('${id}','${nm}')"><i class="fa-solid fa-comment"></i></button>
        <button class="fr-act dots" title="More" onclick="chat._friendMenu(event,'${id}','${nm}',${pinned})"><i class="fa-solid fa-ellipsis-vertical"></i></button>
      </div>`;
    }));
    setHtml(grid, rows.join('') || EMPTY('user-group', 'No friends'));
  };
  const _rp = C.renderProfile.bind(C);
  C.renderProfile = function(){ _rp(); const ls = $('cp-lastseen'); if(ls) ls.textContent = isOn(window.db.user_uid, window.db.user_data) ? 'online now' : 'just now'; };

  /* ---------- small motion extras ---------- */
  const fly = (sel) => { const b = document.querySelector(sel + ' .cc-send'); if(b){ b.classList.remove('fly'); void b.offsetWidth; b.classList.add('fly'); } };
  [['sendWorld', 'wc-input', '#wc-composer'], ['sendThread', 'th-input', '#chat-sub-thread .chat-composer']].forEach(([fn, inp, sel]) => {
    const o = C[fn].bind(C);
    C[fn] = function(){ const i = $(inp); if(i && i.value.trim()) fly(sel); return o(); };
  });
  document.addEventListener('click', (e) => {            // tap an image in chat -> fullscreen
    const im = e.target.closest && e.target.closest('.msg-img'); if(!im) return;
    const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = `<img src="${esc(im.src)}" alt="">`;
    lb.onclick = () => lb.remove(); document.body.appendChild(lb);
  });

  console.log('[chat-fixes] loaded');
})();
