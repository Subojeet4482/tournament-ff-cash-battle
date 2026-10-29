/** Chat views: landing card, full-screen app (Chat / Profile / Game / Search), history sheet, conversation rendering. */
import * as core from './chat.js';
const { S, esc, avatar, chatId, fmtTime, fmtAgo, friendName, isFriend, isBlocked, getProf, sheet, MAX_FRIENDS, EDIT_MS } = core;
const $ = (id) => document.getElementById(id);
const TABS = ['chat', 'profile', 'game', 'search'];
let histTab = 'matches', searchT = null, lastQ = '';

const V = {
    /* ===== landing (tab in bottom nav) ===== */
    mount() { const a = $('chat-app'); if (a && a.parentNode !== document.body) document.body.appendChild(a); },
    onOpen() { V.mount(); if (window.db && window.db.user_uid) core.boot().then(V.renderAll).catch(() => {}); V.renderAll(); },
    async open() {
        V.mount();
        const hero = $('cl-hero'); if (hero) { hero.classList.add('go'); setTimeout(() => hero.classList.remove('go'), 600); }
        try { await core.boot(); } catch (e) {
            const app = $('chat-app'); app.classList.add('on'); app.setAttribute('aria-hidden', 'false'); document.body.classList.add('chat-full'); S.opened = true;
            ['chat', 'profile', 'game', 'search'].forEach(t => $('cp-' + t).innerHTML = '');
            $('cp-chat').innerHTML = `<div class="empty"><i class="fa-solid fa-plug-circle-xmark"></i><b>Chat could not start</b><span>${esc(core.errMsg(e))}</span><button class="cs-b yes" style="margin-top:14px" onclick="chat.close()">Go back</button></div>`;
            V.tab('chat', true); return;
        }
        S.opened = true; const app = $('chat-app'); app.classList.add('on'); app.setAttribute('aria-hidden', 'false'); document.body.classList.add('chat-full');
        V.tab(S.tabName || 'chat', true); V.renderAll();
        if (!S.me) V.onboard();
    },
    close() { if (S.th) core.closeThread(); core.sheetClose(); const app = $('chat-app'); app.classList.remove('on'); app.setAttribute('aria-hidden', 'true'); document.body.classList.remove('chat-full'); S.opened = false; },
    onboard() {
        const d = window.db.user_data || {}, base = String(d.appName || 'player').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'player';
        const sug = base + Math.floor(100 + Math.random() * 900);
        sheet(`<div class="cs-ico"><i class="fa-solid fa-at"></i></div><div class="cs-t">Choose your username</div><div class="cs-p">Friends will find you with this name. It cannot be changed later.</div>
            <input class="cs-in" id="ob-u" maxlength="20" value="${esc(sug)}" autocomplete="off" autocapitalize="off" spellcheck="false" oninput="this.value=this.value.toLowerCase().replace(/[^a-z0-9_]/g,'')">
            <div class="cs-btns"><button class="cs-b no" onclick="chat.sheetClose();chat.close()">Not now</button><button class="cs-b yes" onclick="chat.obGo(this)">Continue</button></div>`, 'cs-sm');
    },
    async obGo(btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; const ok = await core.createProfile($('ob-u').value); btn.disabled = false; btn.textContent = 'Continue'; if (ok) { core.sheetClose(); V.renderAll(); core.toast('Welcome to ' + S.world.name + ' 🔥'); } },

    /* ===== tabs ===== */
    tab(name, instant) {
        const from = TABS.indexOf(S.tabName), to = TABS.indexOf(name); S.tabName = name;
        TABS.forEach((t) => { const p = $('cp-' + t); p.classList.toggle('on', t === name); p.classList.remove('from-l', 'from-r'); if (t === name && !instant) p.classList.add(to > from ? 'from-r' : 'from-l'); });
        document.querySelectorAll('#ca-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === name));
        $('ca-ind').style.transform = `translateX(${to * 100}%)`;
        $('ca-fab').classList.toggle('hidden', name !== 'game');
        V.renderAll();
        if (name === 'search') setTimeout(() => { const i = $('sr-in'); if (i && !instant) i.focus(); }, 380);
    },
    openWorld() { core.openThread('world', 'world'); },

    /* ===== render everything ===== */
    renderAll() {
        const w = S.world, hero = $('cl-hero'); if (!hero) return;
        $('cl-emoji').textContent = w.emoji; $('cl-name').textContent = w.name; $('cl-tag').textContent = w.tagline;
        const unread = V.unreadTotal(), req = S.inc.length;
        $('cl-dot').classList.toggle('hidden', !(unread || req));
        $('cl-chips').innerHTML = S.me ? `<div class="cl-chip"><i class="fa-solid fa-user-group"></i><b>${S.fr.list.length}/${MAX_FRIENDS}</b><span>Friends</span></div>
            <div class="cl-chip ${req ? 'hot' : ''}"><i class="fa-solid fa-user-plus"></i><b>${req}</b><span>Requests</span></div>
            <div class="cl-chip ${unread ? 'hot' : ''}"><i class="fa-solid fa-message"></i><b>${unread}</b><span>Unread</span></div>` : '';
        $('ca-emoji').textContent = w.emoji; $('ca-name').textContent = w.name;
        const tc = $('tb-chat'), tp = $('tb-profile'); tc.textContent = unread; tc.classList.toggle('hidden', !unread); tp.textContent = req; tp.classList.toggle('hidden', !req);
        if (!S.opened) return;
        if (!S.me) { ['chat', 'profile', 'search'].forEach(t => $('cp-' + t).innerHTML = '<div class="empty"><i class="fa-solid fa-at"></i><b>Pick a username to start</b><button class="cs-b yes" style="margin-top:14px" onclick="chat.onboard()">Choose username</button></div>'); V.renderGame(); return; }
        V.renderList(); V.renderProfile(); V.renderGame(); V.renderSearchResults();
        if (S.th) V.renderThreadHead();
        if ($('cs').classList.contains('hist')) V.renderHistory();
    },
    unreadTotal() { let n = 0; Object.values(S.chats).forEach(c => n += (c.unread && c.unread[S.uid]) || 0); Object.values(S.groups).forEach(c => n += (c.unread && c.unread[S.uid]) || 0); return n; },

    /* ===== Chat list ===== */
    renderList() {
        const w = S.world, items = [];
        S.fr.list.forEach(f => { const c = S.chats[chatId(S.uid, f)] || {}; items.push({ kind: 'dm', id: chatId(S.uid, f), uid: f, name: friendName(f), photo: (S.prof[f] || {}).photo, lastMsg: c.lastMsg, lastAt: c.lastAt || 0, unread: (c.unread && c.unread[S.uid]) || 0, star: S.fr.starred.includes(f), online: (S.prof[f] || {}).online }); });
        Object.values(S.groups).forEach(g => items.push({ kind: 'group', id: g.id, name: g.name, emoji: g.emoji, lastMsg: g.lastMsg, lastAt: g.lastAt || 0, unread: (g.unread && g.unread[S.uid]) || 0, members: g.members.length }));
        items.sort((a, b) => (b.star - a.star) || (b.lastAt - a.lastAt));
        $('cp-chat').innerHTML = `<div class="pane-pad">
            <div class="wr-card" onclick="chat.openWorld()"><div class="wr-em">${esc(w.emoji)}</div><div class="wr-t"><b>${esc(w.name)}</b><small>${esc(w.tagline)}</small></div><span class="wr-live"><i></i>LIVE</span></div>
            <div class="sec-h"><span>Chats</span><button class="mini-btn" onclick="chat.createGroup()"><i class="fa-solid fa-users-line"></i> New group</button></div>
            ${items.length ? items.map((it, i) => `<div class="cv-row" style="animation-delay:${Math.min(i, 10) * 45}ms" onclick="chat.openThread('${it.kind}','${it.id}','${it.uid || ''}')">
                <div class="cv-av">${it.kind === 'dm' ? avatar(it.name, it.photo) : `<div class="av av-e">${esc(it.emoji || '👥')}</div>`}${it.online ? '<i class="on"></i>' : ''}</div>
                <div class="cv-t"><b>${esc(it.name)} ${it.star ? '<i class="fa-solid fa-star st"></i>' : ''}${it.kind === 'group' ? `<em>${it.members}</em>` : ''}</b><small>${it.lastMsg ? esc(it.lastMsg) : (it.kind === 'dm' ? 'Say hi 👋' : 'No messages yet')}</small></div>
                <div class="cv-r"><span>${it.lastAt ? fmtAgo(it.lastAt) : ''}</span>${it.unread ? `<em class="bdg">${it.unread}</em>` : ''}</div></div>`).join('')
              : `<div class="empty"><i class="fa-solid fa-comments"></i><b>No chats yet</b><span>Find players in Search and send a friend request. Once accepted you can chat here.</span><button class="cs-b yes" style="margin-top:14px" onclick="chat.tab('search')">Find friends</button></div>`}</div>`;
    },

    /* ===== Profile ===== */
    renderProfile() {
        const m = S.me; if (!m) return;
        const friends = [...S.fr.list].sort((a, b) => (S.fr.starred.includes(b) - S.fr.starred.includes(a)));
        $('cp-profile').innerHTML = `<div class="pane-pad">
            <div class="pf-card"><div class="pf-cover"><button class="pf-hist" onclick="chat.openHistory()"><i class="fa-solid fa-clock-rotate-left"></i> History${S.inc.length ? `<em>${S.inc.length}</em>` : ''}</button></div>
                <div class="pf-av">${avatar(m.name, m.photo, 'av big')}<span class="pf-on"></span></div>
                <div class="pf-name">${esc(m.name)}</div><div class="pf-user">@${esc(m.username)}</div>
                <div class="pf-bio" onclick="chat.editBio()">${m.bio ? esc(m.bio) : '<i>Tap to add a bio</i>'} <i class="fa-solid fa-pen"></i></div>
                <div class="pf-priv"><button class="${!m.isPrivate ? 'on' : ''}" onclick="chat.setPrivacy(false)"><i class="fa-solid fa-earth-asia"></i> Public</button><button class="${m.isPrivate ? 'on' : ''}" onclick="chat.setPrivacy(true)"><i class="fa-solid fa-lock"></i> Private</button><span class="pf-thumb ${m.isPrivate ? 'r' : ''}"></span></div>
                <div class="pf-note">${m.isPrivate ? 'Private: people can find you only by your exact username.' : 'Public: anyone can find you by searching your username.'}</div>
                <div class="pf-stats"><div><b>${S.fr.list.length}<small>/${MAX_FRIENDS}</small></b><span>Friends</span></div><div><b>${S.fr.starred.length}</b><span>Starred</span></div><div><b>${S.bl.length}</b><span>Blocked</span></div></div></div>
            <div class="sec-h"><span>My friends</span></div>
            ${friends.length ? friends.map((f, i) => `<div class="cv-row" style="animation-delay:${Math.min(i, 8) * 40}ms"><div class="cv-av">${avatar(friendName(f), (S.prof[f] || {}).photo)}</div>
                <div class="cv-t"><b>${esc(friendName(f))} ${S.fr.starred.includes(f) ? '<i class="fa-solid fa-star st"></i>' : ''}</b><small>@${esc((S.prof[f] || {}).username || '')}</small></div>
                <div class="cv-act"><button onclick="chat.openThread('dm','${chatId(S.uid, f)}','${f}')"><i class="fa-solid fa-message"></i></button><button class="red" onclick="chat.removeFriend('${f}')"><i class="fa-solid fa-user-minus"></i></button></div></div>`).join('') : '<div class="empty small"><span>No friends yet</span></div>'}
            ${S.bl.length ? `<div class="sec-h"><span>Blocked</span></div>${S.bl.map(b => { getProf(b); return `<div class="cv-row"><div class="cv-av">${avatar((S.prof[b] || {}).name, (S.prof[b] || {}).photo)}</div><div class="cv-t"><b>${esc((S.prof[b] || {}).name || 'User')}</b></div><div class="cv-act"><button onclick="chat.unblock('${b}')"><i class="fa-solid fa-lock-open"></i></button></div></div>`; }).join('')}` : ''}</div>`;
    },

    /* ===== History sheet: match history + friend requests ===== */
    openHistory(t) { if (t) histTab = t; sheet('', 'hist'); V.renderHistory(); },
    histSwitch(t) { histTab = t; V.renderHistory(); },
    renderHistory() {
        const s = $('cs'); s.classList.add('hist');
        let body = '';
        if (histTab === 'matches') {
            const myUid = window.db.user_uid, mine = (window.db.matches || []).filter(m => (window.db.joined_ids || []).includes(m.id) && m.status === 'completed');
            const start = (m) => { const v = m.startTime; return v ? (v.seconds ? v.seconds * 1000 : new Date(v).getTime()) : 0; };
            mine.sort((a, b) => start(b) - start(a));
            body = mine.length && window.app._historyCard ? (window.app._historySummary ? window.app._historySummary(mine, myUid) : '') + mine.slice(0, 30).map((m, i) => window.app._historyCard(m, myUid, i)).join('')
                : '<div class="empty small"><i class="fa-solid fa-gamepad"></i><b>No game history yet</b><span>Your completed matches will show up here.</span></div>';
        } else {
            body = `${S.inc.length ? '' : '<div class="empty small"><i class="fa-solid fa-user-plus"></i><b>No pending requests</b></div>'}
                ${S.inc.map((r, i) => `<div class="rq-row" style="animation-delay:${i * 50}ms">${avatar(r.fromName, r.fromPhoto)}<div class="cv-t"><b>${esc(r.fromName)}</b><small>@${esc(r.fromUsername || '')} wants to be friends</small></div>
                    <button class="rq-b ok" onclick="chat.reqAccept('${r.id}')"><i class="fa-solid fa-check"></i></button><button class="rq-b no" onclick="chat.reqReject('${r.id}')"><i class="fa-solid fa-xmark"></i></button></div>`).join('')}
                ${S.out.filter(r => r.status === 'pending').length ? '<div class="sec-h"><span>Sent</span></div>' : ''}
                ${S.out.filter(r => r.status === 'pending').map(r => `<div class="rq-row">${avatar((S.prof[r.to] || {}).name, (S.prof[r.to] || {}).photo)}<div class="cv-t"><b>${esc((S.prof[r.to] || {}).name || 'Player')}</b><small>Waiting for reply…</small></div><button class="rq-b no" onclick="chat.cancelRequest('${r.id}')"><i class="fa-solid fa-xmark"></i></button></div>`).join('')}`;
        }
        s.innerHTML = `<i class="cs-h"></i><div class="hs-top"><b>History</b><button class="hs-x" onclick="chat.sheetClose()"><i class="fa-solid fa-xmark"></i></button></div>
            <div class="hs-tabs" data-a="${histTab}"><button class="${histTab === 'matches' ? 'on' : ''}" onclick="chat.histSwitch('matches')"><i class="fa-solid fa-gamepad"></i> Match History</button><button class="${histTab === 'requests' ? 'on' : ''}" onclick="chat.histSwitch('requests')"><i class="fa-solid fa-user-plus"></i> Requests${S.inc.length ? `<em>${S.inc.length}</em>` : ''}</button><i class="hs-ind"></i></div>
            <div class="hs-body">${body}</div>`;
    },
    async reqAccept(id) { const r = S.inc.find(x => x.id === id); if (r) { await core.acceptRequest(r); } },
    async reqReject(id) { const r = S.inc.find(x => x.id === id); if (!r) return; const ok = await core.ask({ icon: 'fa-user-xmark', title: `Reject ${r.fromName}?`, yes: 'Reject', danger: true }); if (ok) { await core.rejectRequest(r); V.openHistory('requests'); } },

    /* ===== Game (empty for now) ===== */
    renderGame() { $('cp-game').innerHTML = `<div class="gm"><div class="gm-ring"><i class="fa-solid fa-gamepad"></i></div><b>Games are coming soon</b><span>Play together with your friends right here. Tap the chat button to talk while you wait.</span></div>`; },

    /* ===== Search ===== */
    renderSearchResults() {
        const box = $('cp-search'); if (!$('sr-in')) box.innerHTML = `<div class="pane-pad"><div class="sr-box"><i class="fa-solid fa-at"></i><input id="sr-in" placeholder="Search by username" autocomplete="off" autocapitalize="off" spellcheck="false" oninput="chat.searchInput(this.value)"></div>
            <div class="sr-cap">Friends: <b id="sr-cnt"></b></div><div id="sr-res"></div></div>`;
        $('sr-cnt').textContent = `${S.fr.list.length}/${MAX_FRIENDS}`;
        if (V._res) V.paintResults(V._res);
    },
    searchInput(v) { clearTimeout(searchT); lastQ = v; const res = $('sr-res'); if (v.trim().length < 2) { V._res = null; res.innerHTML = '<div class="empty small"><i class="fa-solid fa-magnifying-glass"></i><span>Type at least 2 letters of a username</span></div>'; return; }
        res.innerHTML = '<div class="ct-load"><i></i><i></i><i></i></div>';
        searchT = setTimeout(async () => { try { const r = await core.searchUsers(v); if (v !== lastQ) return; V._res = r; V.paintResults(r); } catch (e) { res.innerHTML = `<div class="empty small"><span>${esc(core.errMsg(e))}</span></div>`; } }, 350); },
    paintResults(r) {
        const res = $('sr-res'); if (!res) return;
        res.innerHTML = r.length ? r.map((p, i) => {
            let btn; const pend = S.out.find(x => x.to === p.uid && x.status === 'pending'), inc = S.inc.find(x => x.from === p.uid);
            if (isFriend(p.uid)) btn = '<span class="sr-st ok"><i class="fa-solid fa-check"></i> Friends</span>';
            else if (pend) btn = '<span class="sr-st">Requested</span>';
            else if (inc) btn = `<button class="sr-add" onclick="chat.reqAccept('${inc.id}')">Accept</button>`;
            else if (S.fr.list.length >= MAX_FRIENDS) btn = '<span class="sr-st">List full</span>';
            else btn = `<button class="sr-add" onclick="chat.addFriend('${p.uid}',this)"><i class="fa-solid fa-user-plus"></i> Add</button>`;
            return `<div class="cv-row" style="animation-delay:${i * 45}ms"><div class="cv-av">${avatar(p.name, p.photo)}${p.online ? '<i class="on"></i>' : ''}</div><div class="cv-t"><b>${esc(p.name)} ${p.isPrivate ? '<i class="fa-solid fa-lock st2"></i>' : ''}</b><small>@${esc(p.username)}${p.bio ? ' · ' + esc(p.bio) : ''}</small></div>${btn}</div>`; }).join('')
            : '<div class="empty small"><i class="fa-solid fa-user-slash"></i><b>No player found</b><span>Check the username. Private profiles only appear on an exact match.</span></div>';
    },
    async addFriend(uid, btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; const ok = await core.sendRequest(uid); if (!ok) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Add'; } },

    /* ===== conversation ===== */
    renderThreadHead() {
        const th = S.th; if (!th) return; const sub = $('ct-sub'), lock = $('ct-lock'), inp = $('ct-in');
        if (th.kind === 'dm') {
            const p = S.prof[th.uid] || {}; th.name = friendName(th.uid); $('ct-name').textContent = th.name;
            sub.textContent = p.online ? 'online' : (p.lastSeen ? 'last seen ' + fmtAgo(p.lastSeen) + ' ago' : ''); sub.className = p.online ? 'on' : '';
            const bl = isBlocked(th.uid), notF = !isFriend(th.uid);
            lock.classList.toggle('hidden', !(bl || notF)); inp.classList.toggle('hidden', bl || notF);
            lock.innerHTML = bl ? `<i class="fa-solid fa-ban"></i> You blocked this user <button onclick="chat.mBlock()">Unblock</button>` : '<i class="fa-solid fa-user-slash"></i> You are no longer friends';
        } else if (th.kind === 'group') { const g = S.groups[th.id]; sub.textContent = g ? g.members.length + ' members' : ''; sub.className = ''; lock.classList.add('hidden'); inp.classList.remove('hidden'); if (!g) { core.closeThread(); } }
        else { sub.textContent = S.world.locked ? 'locked by admin' : (S.world.tagline || ''); sub.className = ''; lock.classList.toggle('hidden', !S.world.locked); lock.innerHTML = '<i class="fa-solid fa-lock"></i> Chat is locked by admin'; inp.classList.toggle('hidden', !!S.world.locked); }
    },
    renderMsgs() {
        const box = $('ct-msgs'), th = S.th; if (!th) return;
        const near = box.scrollHeight - box.scrollTop - box.clientHeight < 140, first = !box.querySelector('.mg');
        if (!S.thMsgs.length) { box.innerHTML = `<div class="ct-empty"><i class="fa-regular fa-comment-dots"></i><b>No messages yet</b><span>Say hello 👋</span></div>`; return; }
        let day = '', html = '';
        S.thMsgs.forEach((m, i) => {
            const d = new Date(m.at).toDateString(); if (d !== day) { day = d; html += `<div class="mg-day"><span>${d === new Date().toDateString() ? 'Today' : new Date(m.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></div>`; }
            const mine = m.from === S.uid, prev = S.thMsgs[i - 1], grp = th.kind !== 'dm', showName = grp && !mine && (!prev || prev.from !== m.from);
            const canEdit = mine && !m.deleted && Date.now() - m.at < EDIT_MS;
            html += `<div class="mg ${mine ? 'me' : 'th'} ${m.deleted ? 'del' : ''}" data-id="${m.id}">${grp && !mine ? `<div class="mg-av">${showName ? avatar(m.name || friendName(m.from), m.photo || (S.prof[m.from] || {}).photo) : ''}</div>` : ''}
                <div class="mg-b ${canEdit ? 'edit' : ''}" ${mine ? `onclick="chat.msgTap('${m.id}')"` : ''}>${showName ? `<div class="mg-n">${esc(m.name || friendName(m.from))}</div>` : ''}
                ${m.deleted ? '<i class="fa-solid fa-ban"></i> Message deleted' : `<span>${esc(m.text).replace(/\n/g, '<br>')}</span>`}<small>${m.edited && !m.deleted ? 'edited · ' : ''}${fmtTime(m.at)}</small></div></div>`;
        });
        box.innerHTML = html;
        if (first || near || S.thMsgs[S.thMsgs.length - 1].from === S.uid) box.scrollTop = box.scrollHeight;
    },
    grow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 110) + 'px'; $('ct-send').classList.toggle('ready', !!ta.value.trim()); },
    key(e) { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 700) { e.preventDefault(); core.send(); } },
};
window.chat = { ...core, ...V };
core.refresh();
