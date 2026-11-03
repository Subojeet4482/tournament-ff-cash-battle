/**
 * Chat system: World room, friend chats, groups, profile, game placeholder, search.
 * Data lives in the CHAT database (see js/core/chat-firebase.js). Collections: cprofiles, cusernames, cfriends, cblocks,
 * crequests, cchats(/msgs), cgroups(/msgs), cworld, creports, cconfig.
 */
import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, limit,
         writeBatch, increment, arrayUnion, arrayRemove, authService, dbService } from '../../js/core/firebase.js';
import { chatDb as db, chatReady, CHAT_TTL_HOURS } from '../../js/core/chat-firebase.js';

export const MAX_FRIENDS = 20, EDIT_MS = 10 * 60 * 1000;
/** Hooks filled in by chat-keep.js (notifications, saved messages, red dots) — keeps this file free of circular imports. */
export const HK = {};
const hk = (n, ...a) => { try { return HK[n] && HK[n](...a); } catch (e) { console.warn('chat hook', n, e); } };
const $ = (id) => document.getElementById(id);
export const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const S = { uid: null, me: null, fr: { list: [], starred: [], nicks: {} }, bl: [], inc: [], out: [], chats: {}, groups: {}, world: { name: 'Booyah Lounge', emoji: '🔥', tagline: 'Meet players, flex wins, find your squad', slow: 0, locked: false },
                   prof: {}, th: null, thMsgs: [], tabName: 'chat', ready: false, unsubs: [], thUnsub: null, editing: null, lastWorldSend: 0, opened: false, ver: new Set() };
S.reply = null;
export const avatar = (name, photo, cls) => `<img class="${cls || 'av'}" src="${esc(photo || window.gameArt.avatar(name || '?'))}" alt="" loading="lazy" data-seed="${esc(name || '?')}" data-n="${esc((name || '?')[0] || '?').toUpperCase()}" onerror="gameArtFb(this)">`;
export const chatId = (a, b) => [a, b].sort().join('_');
export const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
export const fmtAgo = (ms) => { if (!ms) return ''; const d = Date.now() - ms; if (d < 60000) return 'now'; if (d < 3600000) return Math.floor(d / 60000) + 'm'; if (d < 86400000) return Math.floor(d / 3600000) + 'h'; return Math.floor(d / 86400000) + 'd'; };
/** Message life (ms). Default 24h; admin can change it in Chat Manager (cconfig/world.ttlHours, 1–168). */
export const ttlMs = () => Math.max(1, Math.min(168, Number(S.world && S.world.ttlHours) || CHAT_TTL_HOURS || 24)) * 3600000;
export const alive = (m) => !!m && (Date.now() - (m.at || 0)) < ttlMs();
export const friendName = (uid) => (S.fr.nicks && S.fr.nicks[uid]) || (S.prof[uid] && S.prof[uid].name) || 'Player';
/* ---------- replies: stored natively (rid/rn/rt/ru); falls back to a hidden prefix if the rules were not updated yet ---------- */
const RPX = /^\u2060R(\{.*?\})\u2060/s;
const encReply = (r) => '\u2060R' + JSON.stringify({ i: r.id, n: r.n, t: r.t, u: r.u }) + '\u2060';
/** -> { text, rp: {id,n,t,u}|null } for any message (native fields or encoded prefix) */
export const parseMsg = (m) => {
    if (!m) return { text: '', rp: null };
    if (m.rid) return { text: m.text || '', rp: { id: m.rid, n: m.rn || 'Player', t: m.rt || '', u: m.ru || '' } };
    const t = m.text || '', x = RPX.exec(t);
    if (x) { try { const j = JSON.parse(x[1]); return { text: t.slice(x[0].length), rp: { id: j.i, n: j.n, t: j.t, u: j.u } }; } catch (e) {} }
    return { text: t, rp: null };
};
export const snippet = (m) => { const p = parseMsg(m); return (m.deleted ? 'Message deleted' : p.text).replace(/\s+/g, ' ').trim().slice(0, 100); };
export const isFriend = (uid) => S.fr.list.includes(uid);
/** My avatar exactly as Settings shows it (own photo, else the default art seeded by playerId) — so chat never shows a different picture. */
export const myPhoto = () => { const d = window.db.user_data || {}; return d.photoUrl || (window.gameArt ? window.gameArt.avatar(d.playerId || d.appName || 'User') : ''); };
/** Blue-tick (verified) users: flag is written only by the admin server (rules block users from setting it themselves). */
export const isVer = (uid) => !!uid && ((S.ver && S.ver.has(uid)) || !!((uid === S.uid ? S.me : S.prof[uid]) || {}).verified || (uid === S.uid && !!(window.db.user_data || {}).isVerified));
export const vName = (n, uid, p) => ((p && p.verified) || isVer(uid)) ? `<span class="vn">${esc(n)}</span><i class="fa-solid fa-circle-check vt" title="Verified"></i>` : esc(n);
/** a verified user may moderate (edit / delete) other people's messages in the public World room only */
export const canMod = (m) => !!m && !m.deleted && m.from !== S.uid && isVer(S.uid) && !!S.th && S.th.kind === 'world';
export const isBlocked = (uid) => S.bl.includes(uid);

export async function getProf(uid) {
    if (S.prof[uid]) return S.prof[uid];
    if (_pf[uid]) return _pf[uid];
    // chat profile + the MAIN user record (blue tick = users/{uid}.isVerified, set only by admin) are read together
    _pf[uid] = (async () => {
        let p;
        try { const s = await getDoc(doc(db, 'cprofiles', uid)); p = s.exists() ? { ...s.data() } : { uid, name: 'Player', username: '' }; } catch (e) { p = { uid, name: 'Player', username: '' }; }
        try { const u = await getDoc(doc(dbService, 'users', uid)); if (u.exists()) p.verified = u.data().isVerified === true; } catch (e) { /* keep the chat-profile flag */ }
        S.prof[uid] = p; delete _pf[uid]; return p;
    })();
    return _pf[uid];
}
const _pf = {};

/* ---------- sheet + confirm helpers (every risky action asks first) ---------- */
export function sheet(html, cls) { const s = $('cs'); s.className = 'cs ' + (cls || ''); s.innerHTML = '<i class="cs-h"></i>' + html; $('cs-ov').classList.add('on'); requestAnimationFrame(() => s.classList.add('on')); }
export function sheetClose() { $('cs').classList.remove('on'); $('cs-ov').classList.remove('on'); if (window._csResolve) { const r = window._csResolve; window._csResolve = null; r(null); } }
export function ask(o) {
    return new Promise((resolve) => {
        window._csResolve = resolve;
        sheet(`<div class="cs-ico ${o.danger ? 'red' : ''}"><i class="fa-solid ${o.icon || 'fa-circle-question'}"></i></div><div class="cs-t">${esc(o.title)}</div>
            ${o.text ? `<div class="cs-p">${esc(o.text)}</div>` : ''}
            ${o.input !== undefined ? `<input class="cs-in" id="cs-val" maxlength="${o.max || 30}" value="${esc(o.input)}" placeholder="${esc(o.placeholder || '')}" autocomplete="off">` : ''}
            ${o.chips ? `<div class="cs-chips">${o.chips.map((c, i) => `<button type="button" class="cs-chip ${i === 0 ? 'on' : ''}" onclick="this.parentNode.querySelectorAll('.cs-chip').forEach(x=>x.classList.remove('on'));this.classList.add('on')">${esc(c)}</button>`).join('')}</div>` : ''}
            ${o.area ? `<textarea class="cs-in" id="cs-area" rows="3" maxlength="300" placeholder="${esc(o.area)}"></textarea>` : ''}
            <div class="cs-btns"><button class="cs-b no" onclick="chat.sheetClose()">${esc(o.no || 'Cancel')}</button>
            <button class="cs-b yes ${o.danger ? 'red' : ''}" id="cs-yes">${esc(o.yes || 'Confirm')}</button></div>`, 'cs-sm');
        $('cs-yes').onclick = () => {
            const val = o.input !== undefined ? $('cs-val').value.trim() : o.chips ? ($('cs').querySelector('.cs-chip.on') || {}).textContent : true;
            const extra = o.area ? $('cs-area').value.trim() : '';
            window._csResolve = null; $('cs').classList.remove('on'); $('cs-ov').classList.remove('on'); resolve(o.area ? { val, extra } : val);
        };
        if (o.input !== undefined) setTimeout(() => { try { $('cs-val').focus(); $('cs-val').select(); } catch (e) {} }, 350);
    });
}
export const toast = (m) => window.ui && window.ui.toast ? window.ui.toast(m) : alert(m);
export const errMsg = (e) => (e && e.code === 'permission-denied') ? 'Not allowed (limit reached, blocked, or time over)' : (e && e.message) || 'Something went wrong';

/* ---------- boot / listeners ---------- */
const listen = (q, fn) => { const u = onSnapshot(q, fn, (e) => console.warn('chat listen', e.code)); S.unsubs.push(u); };
let rt = null;
export const refresh = () => { clearTimeout(rt); rt = setTimeout(() => { try { window.chat.renderAll(); } catch (e) { console.error(e); } }, 60); };

async function startListeners() {
    const uid = S.uid;
    listen(doc(db, 'cfriends', uid), (s) => { S.fr = s.exists() ? { list: [], starred: [], nicks: {}, ...s.data() } : { list: [], starred: [], nicks: {} }; S.fr.list.forEach(getProf); refresh(); });
    listen(doc(db, 'cblocks', uid), (s) => { S.bl = s.exists() ? (s.data().list || []) : []; refresh(); });
    listen(query(collection(db, 'crequests'), where('to', '==', uid)), (s) => { S.inc = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.status === 'pending'); refresh(); });
    listen(query(collection(db, 'crequests'), where('from', '==', uid)), (s) => { S.out = s.docs.map(d => ({ id: d.id, ...d.data() })); S.out.forEach(r => getProf(r.to)); refresh(); });
    listen(query(collection(db, 'cchats'), where('members', 'array-contains', uid)), (s) => { const prev = S.chats; S.chats = {}; s.docs.forEach(d => S.chats[d.id] = { id: d.id, ...d.data() }); hk('onChats', prev, S.chats, 'dm'); refresh(); });
    listen(query(collection(db, 'cgroups'), where('members', 'array-contains', uid)), (s) => { const prev = S.groups; S.groups = {}; s.docs.forEach(d => S.groups[d.id] = { id: d.id, ...d.data() }); hk('onChats', prev, S.groups, 'group'); refresh(); });
    clearInterval(presenceT); if (visH) document.removeEventListener('visibilitychange', visH);
    presenceT = setInterval(() => { if (S.me && S.uid === uid && !document.hidden) updateDoc(doc(db, 'cprofiles', uid), { online: true, lastSeen: Date.now() }).catch(() => {}); }, 60000);
    visH = () => { if (S.me && S.uid === uid) updateDoc(doc(db, 'cprofiles', uid), { online: !document.hidden, lastSeen: Date.now() }).catch(() => {}); };
    document.addEventListener('visibilitychange', visH);
}
let presenceT = null, visH = null;

/** Wipe everything that belongs to the previous account (listeners, timers, cached profiles, open thread) — called on logout and when another account logs in. */
export function resetChat() {
    S.unsubs.forEach(u => { try { u(); } catch (e) {} }); S.unsubs = [];
    if (S.thUnsub) { try { S.thUnsub(); } catch (e) {} S.thUnsub = null; }
    clearInterval(presenceT); presenceT = null; if (visH) { document.removeEventListener('visibilitychange', visH); visH = null; }
    Object.assign(S, { uid: null, me: null, fr: { list: [], starred: [], nicks: {} }, bl: [], inc: [], out: [], chats: {}, groups: {}, prof: {}, th: null, thMsgs: [], tabName: 'chat',
                       ready: false, editing: null, lastWorldSend: 0, opened: false, ver: new Set(), reply: null });
    for (const k in _pf) delete _pf[k];
    bootP = null; bootUid = null;
    try { $('ct').classList.remove('on'); sheetClose(); } catch (e) {}
    try { window.chat.onReset && window.chat.onReset(); } catch (e) {}
    try { window.chat.renderAll && window.chat.renderAll(); } catch (e) {}
}
let bootP = null, bootUid = null;
export function boot() {
    const u = authService.currentUser;
    if (!u) { if (S.uid) resetChat(); return Promise.reject(new Error('Please login first')); }
    if (S.ready && S.uid === u.uid) return Promise.resolve(true);
    if (bootP && bootUid === u.uid) return bootP;
    if (S.uid && S.uid !== u.uid) resetChat();          // another account logged in on this device -> start clean
    bootUid = u.uid; const p = _boot(u); bootP = p; p.then(() => { if (bootP === p) bootP = null; }, () => { if (bootP === p) bootP = null; });
    return p;
}
async function _boot(u) {
    S.uid = u.uid;
    const same = () => { const c = authService.currentUser; return !!c && c.uid === u.uid && S.uid === u.uid; };
    await chatReady(); if (!same()) return false;
    listen(doc(db, 'cconfig', 'verified'), (s) => { S.ver = new Set(s.exists() ? (s.data().uids || []) : []); refresh(); try { if (S.th) window.chat.renderMsgs(); } catch (e) {} });
    listen(doc(db, 'cconfig', 'world'), (s) => { if (s.exists()) S.world = { ...S.world, ...s.data() }; refresh(); });
    const snap = await getDoc(doc(db, 'cprofiles', u.uid)); if (!same()) return false;
    S.me = snap.exists() ? snap.data() : null;
    if (S.me) {
        const photo = myPhoto(), name = (window.db.user_data || {}).appName || S.me.name;
        if ((photo && photo !== S.me.photo) || (name && name !== S.me.name)) { S.me.photo = photo || S.me.photo; S.me.name = name; updateDoc(doc(db, 'cprofiles', S.uid), { photo: S.me.photo || '', name: S.me.name }).catch(() => {}); }
        await startListeners(); if (!same()) return false;
    }
    S.ready = true; return true;
}
export async function createProfile(uname) {
    uname = String(uname || '').toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,20}$/.test(uname)) return toast('Username: 3–20 letters, numbers or _'), false;
    const u = authService.currentUser, d = window.db.user_data || {};
    const name = d.appName || u.displayName || 'Player', photo = myPhoto();
    const prof = { uid: S.uid, username: uname, name, photo, isPrivate: false, bio: '', createdAt: Date.now(), lastSeen: Date.now(), online: true };
    try {
        const b = writeBatch(db);
        b.set(doc(db, 'cusernames', uname), { uid: S.uid });
        b.set(doc(db, 'cprofiles', S.uid), prof);
        b.set(doc(db, 'cfriends', S.uid), { list: [], starred: [], nicks: {}, lastAdded: '' });
        b.set(doc(db, 'cblocks', S.uid), { list: [] });
        await b.commit();
        S.me = prof; await startListeners(); return true;
    } catch (e) { toast(e.code === 'permission-denied' ? 'That username is taken — try another' : errMsg(e)); return false; }
}

/* ---------- friend requests ---------- */
export async function sendRequest(uid) {
    if (S.fr.list.length >= MAX_FRIENDS) return toast(`Your friend list is full (${MAX_FRIENDS}/${MAX_FRIENDS})`);
    const id = S.uid + '_' + uid;
    try {
        const ex = await getDoc(doc(db, 'crequests', id)); if (ex.exists()) await deleteDoc(doc(db, 'crequests', id));
        await setDoc(doc(db, 'crequests', id), { from: S.uid, to: uid, status: 'pending', createdAt: Date.now(), fromName: S.me.name, fromPhoto: S.me.photo || '', fromUsername: S.me.username });
        toast('Friend request sent ✓'); return true;
    } catch (e) { toast(e.code === 'permission-denied' ? "Couldn't send — their list may be full or you are blocked" : errMsg(e)); return false; }
}
export async function acceptRequest(r) {
    if (S.fr.list.length >= MAX_FRIENDS) return toast(`Your friend list is full (${MAX_FRIENDS}/${MAX_FRIENDS})`);
    try {
        const b = writeBatch(db);
        b.update(doc(db, 'crequests', r.id), { status: 'accepted', respondedAt: Date.now() });
        b.update(doc(db, 'cfriends', S.uid), { list: arrayUnion(r.from), lastAdded: r.from });
        b.update(doc(db, 'cfriends', r.from), { list: arrayUnion(S.uid) });
        await b.commit(); toast('You are now friends 🎉'); return true;
    } catch (e) { toast(e.code === 'permission-denied' ? "Couldn't accept — their friend list may be full" : errMsg(e)); return false; }
}
export async function rejectRequest(r) { try { await updateDoc(doc(db, 'crequests', r.id), { status: 'rejected', respondedAt: Date.now() }); toast('Request rejected'); } catch (e) { toast(errMsg(e)); } }
export async function cancelRequest(id) { try { await deleteDoc(doc(db, 'crequests', id)); toast('Request cancelled'); } catch (e) { toast(errMsg(e)); } }
export async function removeFriend(uid) {
    const ok = await ask({ icon: 'fa-user-minus', title: `Remove ${friendName(uid)}?`, text: 'You will both lose this friend. You can send a new request later.', yes: 'Remove', danger: true }); if (!ok) return;
    try {
        const b = writeBatch(db);
        b.update(doc(db, 'cfriends', S.uid), { list: arrayRemove(uid), starred: arrayRemove(uid) });
        b.update(doc(db, 'cfriends', uid), { list: arrayRemove(S.uid) });
        await b.commit();
        try { await deleteDoc(doc(db, 'crequests', S.uid + '_' + uid)); } catch (e) {} try { await deleteDoc(doc(db, 'crequests', uid + '_' + S.uid)); } catch (e) {}
        toast('Friend removed');
    } catch (e) { toast(errMsg(e)); }
}

/* ---------- conversation ---------- */
export const pathOf = (th) => th.kind === 'world' ? 'cworld' : th.kind === 'dm' ? `cchats/${th.id}/msgs` : `cgroups/${th.id}/msgs`;
export async function openThread(kind, id, uid) {
    closeMenu();
    const th = { kind, id, uid }; S.th = th; S.editing = null;
    if (kind === 'dm') { await getProf(uid); th.name = friendName(uid); th.photo = S.prof[uid].photo; }
    if (kind === 'group') { const g = S.groups[id] || {}; th.name = g.name || 'Group'; th.emoji = g.emoji || '👥'; }
    if (kind === 'world') { th.name = S.world.name; th.emoji = S.world.emoji; }
    $('ct-name').textContent = th.name;
    $('ct-av').innerHTML = kind === 'dm' ? avatar(th.name, th.photo) : `<div class="av av-e">${esc(th.emoji || '👥')}</div>`;
    $('ct-dots').style.display = '';
    $('ct-msgs').innerHTML = '<div class="ct-load"><i></i><i></i><i></i></div>';
    $('ct').classList.add('on'); $('ct-text').value = ''; window.chat.grow($('ct-text')); $('ct-edit').classList.add('hidden');
    window.chat.renderThreadHead();
    if (S.thUnsub) { S.thUnsub(); S.thUnsub = null; }
    hk('onOpen', th);
    S.thUnsub = onSnapshot(query(collection(db, pathOf(th)), where('at', '>', Date.now() - ttlMs()), orderBy('at', 'desc'), limit(80)), (s) => {
        S.thMsgs = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(alive).reverse(); hk('onMsgs', th, S.thMsgs); window.chat.renderMsgs(); markRead();
    }, (e) => { $('ct-msgs').innerHTML = `<div class="ct-empty"><i class="fa-solid fa-lock"></i><b>Can't open this chat</b><span>${esc(errMsg(e))}</span></div>`; });
}
export function closeThread() { const th = S.th; $('ct').classList.remove('on'); closeMenu(); if (S.thUnsub) { S.thUnsub(); S.thUnsub = null; } S.th = null; S.editing = null; hk('onClose', th); }
function markRead() {
    const th = S.th; if (!th || th.kind === 'world') return;
    const col = th.kind === 'dm' ? 'cchats' : 'cgroups', c = th.kind === 'dm' ? S.chats[th.id] : S.groups[th.id];
    if (c && c.unread && c.unread[S.uid]) updateDoc(doc(db, col, th.id), { ['unread.' + S.uid]: 0 }).catch(() => {});
}
export function closeMenu() { const m = $('ct-menu'); if (m) m.classList.add('hidden'); }

export function replyTo(id) {
    const m = S.thMsgs.find(x => x.id === id); if (!m || m.deleted || !S.th) return;
    S.reply = { id: m.id, n: m.from === S.uid ? 'You' : (m.name || friendName(m.from)), t: snippet(m), u: m.from };
    sheetClose(); window.chat.paintReply && window.chat.paintReply();
    const ta = $('ct-text'); if (ta) setTimeout(() => ta.focus(), 60);
}
export function cancelReply() { S.reply = null; window.chat.paintReply && window.chat.paintReply(); }
/** Open (or start) a direct message with anyone — friends, or World users whose profile is public. */
export async function openDm(uid) {
    if (!uid || uid === S.uid) return;
    const p = await getProf(uid);
    if (isBlocked(uid)) return toast('You blocked this user — unblock to message');
    if (!isFriend(uid) && p && p.isPrivate) return toast('This profile is private — send a friend request first');
    sheetClose(); window.chat.openThread('dm', chatId(S.uid, uid), uid);
}
export async function send() {
    const th = S.th; if (!th) return;
    const ta = $('ct-text'), text = ta.value.trim(); if (!text) return;
    if (S.editing) return doEdit(text);
    const now = Date.now();
    if (th.kind === 'world') {
        if (S.world.locked) return toast('World chat is locked by admin right now');
        const slow = (S.world.slow || 0) * 1000; if (slow && now - S.lastWorldSend < slow) return toast(`Slow mode: wait ${Math.ceil((slow - (now - S.lastWorldSend)) / 1000)}s`);
    }
    if (th.kind === 'dm' && isBlocked(th.uid)) return toast('You blocked this user');
    const rp = S.reply; S.reply = null; window.chat.paintReply && window.chat.paintReply();
    ta.value = ''; window.chat.grow(ta); const btn = $('ct-send'); btn.classList.add('pop'); setTimeout(() => btn.classList.remove('pop'), 300);
    try {
        const msg = { from: S.uid, text, at: now };
        if (th.kind === 'world') { msg.name = S.me.name; msg.photo = S.me.photo || ''; S.lastWorldSend = now; }
        if (th.kind === 'dm' && !S.chats[th.id]) {
            const members = [S.uid, th.uid].sort();
            await setDoc(doc(db, 'cchats', th.id), { members, createdAt: now, lastMsg: '', lastAt: 0, lastFrom: '', unread: {} });
            S.chats[th.id] = { id: th.id, members };
        }
        if (rp && !S.noReplyFields) {
            try { await addDoc(collection(db, pathOf(th)), { ...msg, rid: rp.id, rn: String(rp.n).slice(0, 40), rt: String(rp.t).slice(0, 140), ru: rp.u || '' }); }
            catch (e) { if (e.code === 'permission-denied') { S.noReplyFields = true; await addDoc(collection(db, pathOf(th)), { ...msg, text: encReply({ id: rp.id, n: String(rp.n).slice(0, 30), t: String(rp.t).slice(0, 80), u: rp.u || '' }) + text }); } else throw e; }
        } else await addDoc(collection(db, pathOf(th)), rp ? { ...msg, text: encReply({ id: rp.id, n: String(rp.n).slice(0, 30), t: String(rp.t).slice(0, 80), u: rp.u || '' }) + text } : msg);
        if (th.kind === 'dm') await updateDoc(doc(db, 'cchats', th.id), { lastMsg: ((rp ? '↪ ' : '') + text).slice(0, 60), lastAt: now, lastFrom: S.uid, ['unread.' + th.uid]: increment(1) });
        if (th.kind === 'group') { const g = S.groups[th.id] || {}, up = { lastMsg: ((rp ? '↪ ' : '') + text).slice(0, 60), lastAt: now, lastFrom: S.uid }; (g.members || []).forEach(m => { if (m !== S.uid) up['unread.' + m] = increment(1); }); await updateDoc(doc(db, 'cgroups', th.id), up); }
    } catch (e) { ta.value = text; window.chat.grow(ta); toast(e.code === 'permission-denied' ? "Message not sent — you can't message this user" : errMsg(e)); }
}
async function doEdit(text) {
    const th = S.th, id = S.editing; const m = S.thMsgs.find(x => x.id === id);
    const mod = canMod(m);
    if (!m || (!mod && Date.now() - m.at >= EDIT_MS)) { cancelEdit(); return toast('Edit time (10 min) is over'); }
    try { const pre = (m.rid || !RPX.test(m.text || '')) ? '' : RPX.exec(m.text)[0]; await updateDoc(doc(db, pathOf(th), id), mod ? { text: pre + text, edited: true, editBy: S.uid } : { text: pre + text, edited: true }); cancelEdit(); } catch (e) { toast(errMsg(e)); }
}
export function cancelEdit() { S.editing = null; $('ct-edit').classList.add('hidden'); $('ct-text').value = ''; window.chat.grow($('ct-text')); }
export async function msgTap(id) {
    const m = S.thMsgs.find(x => x.id === id); if (!m || m.from !== S.uid || m.deleted) return;
    const left = EDIT_MS - (Date.now() - m.at);
    if (left <= 0) return toast('You can edit or delete a message only within 10 minutes');
    const mins = Math.floor(left / 60000), secs = Math.floor((left % 60000) / 1000);
    sheet(`<div class="cs-t">Your message</div><div class="cs-quote">${esc(m.text)}</div><div class="cs-timer"><i class="fa-regular fa-clock"></i> ${mins}m ${secs}s left to edit or delete</div>
        <div class="cs-list"><button onclick="chat.editStart('${id}')"><i class="fa-solid fa-pen"></i> Edit message</button>
        <button class="red" onclick="chat.delMsg('${id}')"><i class="fa-solid fa-trash"></i> Delete message</button></div>`, 'cs-sm');
}
export function editStart(id) {
    const m = S.thMsgs.find(x => x.id === id); if (!m) return; sheetClose(); S.editing = id;
    $('ct-edit').classList.remove('hidden'); const ta = $('ct-text'); ta.value = parseMsg(m).text; window.chat.grow(ta); ta.focus();
}
export async function delMsg(id) {
    const ok = await ask({ icon: 'fa-trash', title: 'Delete this message?', text: 'It will be removed for everyone.', yes: 'Delete', danger: true }); if (!ok) return;
    const m = S.thMsgs.find(x => x.id === id), mod = canMod(m); if (!m || (!mod && Date.now() - m.at >= EDIT_MS)) return toast('Delete time (10 min) is over');
    try { await updateDoc(doc(db, pathOf(S.th), id), mod ? { deleted: true, text: '', delBy: S.uid } : { deleted: true, text: '' }); toast('Message deleted'); } catch (e) { toast(errMsg(e)); }
}

/* ---------- 3-dots menu: block / star / rename / report ---------- */
export function threadMenu() {
    const th = S.th; if (!th) return; const m = $('ct-menu');
    if (!m.classList.contains('hidden')) return closeMenu();
    let items = '';
    if (th.kind === 'dm') {
        const st = S.fr.starred.includes(th.uid), bl = isBlocked(th.uid);
        items = `<button onclick="chat.mBlock()"><i class="fa-solid ${bl ? 'fa-lock-open' : 'fa-ban'}"></i>${bl ? 'Unblock user' : 'Block user'}</button>
                 <button onclick="chat.mStar()"><i class="fa-${st ? 'solid' : 'regular'} fa-star" style="color:#f59e0b"></i>${st ? 'Remove star' : 'Star friend'}</button>
                 <button onclick="chat.mRename()"><i class="fa-solid fa-pen"></i>Rename</button>
                 <button class="red" onclick="chat.mReport()"><i class="fa-solid fa-flag"></i>Report</button>`;
    } else if (th.kind === 'group') {
        items = `<button onclick="chat.mGroupInfo()"><i class="fa-solid fa-users"></i>Group info</button><button class="red" onclick="chat.mLeave()"><i class="fa-solid fa-right-from-bracket"></i>Leave group</button><button class="red" onclick="chat.mReport()"><i class="fa-solid fa-flag"></i>Report</button>`;
    }
    m.innerHTML = items; m.classList.remove('hidden');
}
export async function mBlock() {
    closeMenu(); const uid = S.th.uid, bl = isBlocked(uid), n = friendName(uid);
    const ok = await ask({ icon: bl ? 'fa-lock-open' : 'fa-ban', title: bl ? `Unblock ${n}?` : `Block ${n}?`, text: bl ? 'They will be able to message you again.' : 'They will not be able to send you messages.', yes: bl ? 'Unblock' : 'Block', danger: !bl }); if (!ok) return;
    try { await updateDoc(doc(db, 'cblocks', S.uid), { list: bl ? arrayRemove(uid) : arrayUnion(uid) }); toast(bl ? 'User unblocked' : 'User blocked'); window.chat.renderThreadHead(); } catch (e) { toast(errMsg(e)); }
}
export async function mStar() {
    closeMenu(); const uid = S.th.uid, st = S.fr.starred.includes(uid), n = friendName(uid);
    const ok = await ask({ icon: 'fa-star', title: st ? `Remove star from ${n}?` : `Star ${n}?`, text: st ? 'They will no longer be pinned on top.' : 'Starred friends are pinned on top of your chat list.', yes: st ? 'Remove star' : 'Star friend' }); if (!ok) return;
    try { await updateDoc(doc(db, 'cfriends', S.uid), { starred: st ? arrayRemove(uid) : arrayUnion(uid) }); toast(st ? 'Star removed' : 'Friend starred ⭐'); } catch (e) { toast(errMsg(e)); }
}
export async function mRename() {
    closeMenu(); const uid = S.th.uid, real = (S.prof[uid] || {}).name || 'Player';
    const v = await ask({ icon: 'fa-pen', title: 'Rename (only for you)', text: `Their real name stays "${real}". Leave empty to reset.`, input: (S.fr.nicks || {})[uid] || '', placeholder: real, yes: 'Save name' }); if (v === null) return;
    try { await updateDoc(doc(db, 'cfriends', S.uid), { ['nicks.' + uid]: v }); S.th.name = v || real; $('ct-name').textContent = S.th.name; toast('Name saved'); } catch (e) { toast(errMsg(e)); }
}
export async function mReport() {
    closeMenu(); const th = S.th, uid = th.uid || '', n = th.kind === 'dm' ? friendName(uid) : th.name;
    const r = await ask({ icon: 'fa-flag', title: `Report ${n}?`, text: 'This sends a message to our support team. They will review the chat.', chips: ['Spam', 'Abuse / harassment', 'Cheating / hacks', 'Scam / fraud', 'Other'], area: 'Tell support what happened (optional)', yes: 'Send to support', danger: true }); if (!r) return;
    try {
        await addDoc(collection(db, 'creports'), { from: S.uid, against: uid, chatId: th.id || 'world', kind: th.kind, reason: r.val + (r.extra ? ' — ' + r.extra : ''), createdAt: Date.now(), status: 'open', fromName: S.me.name, againstName: n });
        toast('Report sent to support ✓');
    } catch (e) { toast(errMsg(e)); }
}
export async function mGroupInfo() {
    closeMenu(); const g = S.groups[S.th.id]; if (!g) return; await Promise.all(g.members.map(getProf));
    sheet(`<div class="cs-t">${esc(g.emoji || '👥')} ${esc(g.name)}</div><div class="cs-p">${g.members.length} members</div><div class="cs-list">${g.members.map(m => `<div class="cs-mem">${avatar(S.prof[m].name, S.prof[m].photo)}<b>${m === S.uid ? vName('You', m) : vName(friendName(m), m)}</b>${m === g.owner ? '<em>owner</em>' : ''}</div>`).join('')}</div>`);
}
export async function mLeave() {
    closeMenu(); const g = S.groups[S.th.id]; if (!g) return;
    const ok = await ask({ icon: 'fa-right-from-bracket', title: `Leave "${g.name}"?`, text: 'You will stop receiving messages from this group.', yes: 'Leave', danger: true }); if (!ok) return;
    try { await updateDoc(doc(db, 'cgroups', g.id), { members: arrayRemove(S.uid) }); closeThread(); toast('You left the group'); } catch (e) { toast(errMsg(e)); }
}
export async function createGroup() {
    if (!S.fr.list.length) return toast('Add some friends first');
    await Promise.all(S.fr.list.map(getProf));
    window._grpSel = new Set();
    sheet(`<div class="cs-t">New group</div><input class="cs-in" id="grp-name" maxlength="30" placeholder="Group name" autocomplete="off">
        <div class="cs-p" style="text-align:left;margin:10px 0 6px">Add friends</div>
        <div class="cs-list cs-pick">${S.fr.list.map(f => `<div class="cs-mem pick" id="gp-${f}" onclick="chat.grpPick('${f}')">${avatar(S.prof[f].name, S.prof[f].photo)}<b>${vName(friendName(f), f)}</b><i class="fa-regular fa-circle"></i></div>`).join('')}</div>
        <div class="cs-btns"><button class="cs-b no" onclick="chat.sheetClose()">Cancel</button><button class="cs-b yes" onclick="chat.grpMake()">Create</button></div>`);
}
export function grpPick(f) { const s = window._grpSel, el = $('gp-' + f); if (s.has(f)) { s.delete(f); el.classList.remove('on'); el.querySelector('i').className = 'fa-regular fa-circle'; } else { if (s.size >= 29) return; s.add(f); el.classList.add('on'); el.querySelector('i').className = 'fa-solid fa-circle-check'; } }
export async function grpMake() {
    const name = $('grp-name').value.trim(); if (name.length < 2) return toast('Enter a group name'); if (!window._grpSel.size) return toast('Pick at least one friend');
    try { const ref = await addDoc(collection(db, 'cgroups'), { name, emoji: ['🎮', '⚔️', '🏆', '🔥', '🦅', '💥'][Math.floor(Math.random() * 6)], owner: S.uid, members: [S.uid, ...window._grpSel], createdAt: Date.now(), lastMsg: '', lastAt: Date.now(), lastFrom: '', unread: {} });
        sheetClose(); toast('Group created 🎉'); setTimeout(() => window.chat.openThread('group', ref.id), 350); } catch (e) { toast(errMsg(e)); }
}

/* ---------- profile settings ---------- */
export async function setPrivacy(p) {
    try { await updateDoc(doc(db, 'cprofiles', S.uid), { isPrivate: !!p }); S.me.isPrivate = !!p; refresh(); } catch (e) { toast(errMsg(e)); }
}
export async function editBio() {
    const v = await ask({ icon: 'fa-pen', title: 'Your bio', input: S.me.bio || '', max: 80, placeholder: 'Say something about you', yes: 'Save' }); if (v === null) return;
    try { await updateDoc(doc(db, 'cprofiles', S.uid), { bio: v }); S.me.bio = v; refresh(); } catch (e) { toast(errMsg(e)); }
}
export async function unblock(uid) { const ok = await ask({ icon: 'fa-lock-open', title: 'Unblock this user?', yes: 'Unblock' }); if (!ok) return; try { await updateDoc(doc(db, 'cblocks', S.uid), { list: arrayRemove(uid) }); toast('Unblocked'); } catch (e) { toast(errMsg(e)); } }
export async function searchUsers(q) {
    q = String(q || '').toLowerCase().trim().replace(/^@/, ''); if (q.length < 2) return [];
    const s = await getDocs(query(collection(db, 'cprofiles'), where('username', '>=', q), where('username', '<=', q + '\uf8ff'), limit(15)));
    return s.docs.map(d => d.data()).filter(p => p.uid !== S.uid && (!p.isPrivate || p.username === q));
}
