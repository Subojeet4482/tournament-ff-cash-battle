/**
 * Chat system: World room, friend chats, groups, profile, game placeholder, search.
 * Data lives in the CHAT database (see js/core/chat-firebase.js). Collections: cprofiles, cusernames, cfriends, cblocks,
 * crequests, cchats(/msgs), cgroups(/msgs), cworld, creports, cconfig.
 */
import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, limit,
         writeBatch, increment, arrayUnion, arrayRemove, authService } from '../../js/core/firebase.js';
import { chatDb as db, chatReady } from '../../js/core/chat-firebase.js';

export const MAX_FRIENDS = 20, EDIT_MS = 10 * 60 * 1000;
const $ = (id) => document.getElementById(id);
export const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const S = { uid: null, me: null, fr: { list: [], starred: [], nicks: {} }, bl: [], inc: [], out: [], chats: {}, groups: {}, world: { name: 'Booyah Lounge', emoji: '🔥', tagline: 'Meet players, flex wins, find your squad', slow: 0, locked: false },
                   prof: {}, th: null, thMsgs: [], tabName: 'chat', ready: false, unsubs: [], thUnsub: null, editing: null, lastWorldSend: 0, opened: false };
export const avatar = (name, photo, cls) => photo ? `<img class="${cls || 'av'}" src="${esc(photo)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${cls || 'av'} av-t',textContent:'${esc((name || '?')[0] || '?').toUpperCase()}'}))">` : `<div class="${cls || 'av'} av-t">${esc((name || '?')[0] || '?').toUpperCase()}</div>`;
export const chatId = (a, b) => [a, b].sort().join('_');
export const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
export const fmtAgo = (ms) => { if (!ms) return ''; const d = Date.now() - ms; if (d < 60000) return 'now'; if (d < 3600000) return Math.floor(d / 60000) + 'm'; if (d < 86400000) return Math.floor(d / 3600000) + 'h'; return Math.floor(d / 86400000) + 'd'; };
export const friendName = (uid) => (S.fr.nicks && S.fr.nicks[uid]) || (S.prof[uid] && S.prof[uid].name) || 'Player';
export const isFriend = (uid) => S.fr.list.includes(uid);
export const isBlocked = (uid) => S.bl.includes(uid);

export async function getProf(uid) {
    if (S.prof[uid]) return S.prof[uid];
    try { const s = await getDoc(doc(db, 'cprofiles', uid)); S.prof[uid] = s.exists() ? s.data() : { uid, name: 'Player', username: '' }; } catch (e) { S.prof[uid] = { uid, name: 'Player', username: '' }; }
    return S.prof[uid];
}

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
    listen(query(collection(db, 'cchats'), where('members', 'array-contains', uid)), (s) => { S.chats = {}; s.docs.forEach(d => S.chats[d.id] = { id: d.id, ...d.data() }); refresh(); });
    listen(query(collection(db, 'cgroups'), where('members', 'array-contains', uid)), (s) => { S.groups = {}; s.docs.forEach(d => S.groups[d.id] = { id: d.id, ...d.data() }); refresh(); });
    setInterval(() => { if (S.me && !document.hidden) updateDoc(doc(db, 'cprofiles', uid), { online: true, lastSeen: Date.now() }).catch(() => {}); }, 60000);
    document.addEventListener('visibilitychange', () => { if (S.me) updateDoc(doc(db, 'cprofiles', uid), { online: !document.hidden, lastSeen: Date.now() }).catch(() => {}); });
}
export async function boot() {
    if (S.ready) return true;
    const u = authService.currentUser; if (!u) throw new Error('Please login first');
    S.uid = u.uid;
    await chatReady();
    try { onSnapshot(doc(db, 'cconfig', 'world'), (s) => { if (s.exists()) S.world = { ...S.world, ...s.data() }; refresh(); }, () => {}); } catch (e) {}
    const snap = await getDoc(doc(db, 'cprofiles', S.uid));
    S.me = snap.exists() ? snap.data() : null;
    if (S.me) {
        const d = window.db.user_data || {}, photo = d.photoUrl || d.photoURL || u.photoURL || '', name = d.appName || S.me.name;
        if ((photo && photo !== S.me.photo) || (name && name !== S.me.name)) { S.me.photo = photo || S.me.photo; S.me.name = name; updateDoc(doc(db, 'cprofiles', S.uid), { photo: S.me.photo || '', name: S.me.name }).catch(() => {}); }
        await startListeners();
    }
    S.ready = true; return true;
}
export async function createProfile(uname) {
    uname = String(uname || '').toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,20}$/.test(uname)) return toast('Username: 3–20 letters, numbers or _'), false;
    const u = authService.currentUser, d = window.db.user_data || {};
    const name = d.appName || u.displayName || 'Player', photo = d.photoUrl || d.photoURL || u.photoURL || '';
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
const pathOf = (th) => th.kind === 'world' ? 'cworld' : th.kind === 'dm' ? `cchats/${th.id}/msgs` : `cgroups/${th.id}/msgs`;
export async function openThread(kind, id, uid) {
    closeMenu();
    const th = { kind, id, uid }; S.th = th; S.editing = null;
    if (kind === 'dm') { await getProf(uid); th.name = friendName(uid); th.photo = S.prof[uid].photo; }
    if (kind === 'group') { const g = S.groups[id] || {}; th.name = g.name || 'Group'; th.emoji = g.emoji || '👥'; }
    if (kind === 'world') { th.name = S.world.name; th.emoji = S.world.emoji; }
    $('ct-name').textContent = th.name;
    $('ct-av').innerHTML = kind === 'dm' ? avatar(th.name, th.photo) : `<div class="av av-e">${esc(th.emoji || '👥')}</div>`;
    $('ct-dots').style.display = kind === 'world' ? 'none' : '';
    $('ct-msgs').innerHTML = '<div class="ct-load"><i></i><i></i><i></i></div>';
    $('ct').classList.add('on'); $('ct-text').value = ''; window.chat.grow($('ct-text')); $('ct-edit').classList.add('hidden');
    window.chat.renderThreadHead();
    if (S.thUnsub) { S.thUnsub(); S.thUnsub = null; }
    S.thUnsub = onSnapshot(query(collection(db, pathOf(th)), orderBy('at', 'desc'), limit(80)), (s) => {
        S.thMsgs = s.docs.map(d => ({ id: d.id, ...d.data() })).reverse(); window.chat.renderMsgs(); markRead();
    }, (e) => { $('ct-msgs').innerHTML = `<div class="ct-empty"><i class="fa-solid fa-lock"></i><b>Can't open this chat</b><span>${esc(errMsg(e))}</span></div>`; });
}
export function closeThread() { $('ct').classList.remove('on'); closeMenu(); if (S.thUnsub) { S.thUnsub(); S.thUnsub = null; } S.th = null; S.editing = null; }
function markRead() {
    const th = S.th; if (!th || th.kind === 'world') return;
    const col = th.kind === 'dm' ? 'cchats' : 'cgroups', c = th.kind === 'dm' ? S.chats[th.id] : S.groups[th.id];
    if (c && c.unread && c.unread[S.uid]) updateDoc(doc(db, col, th.id), { ['unread.' + S.uid]: 0 }).catch(() => {});
}
export function closeMenu() { const m = $('ct-menu'); if (m) m.classList.add('hidden'); }

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
    ta.value = ''; window.chat.grow(ta); const btn = $('ct-send'); btn.classList.add('pop'); setTimeout(() => btn.classList.remove('pop'), 300);
    try {
        const msg = { from: S.uid, text, at: now };
        if (th.kind === 'world') { msg.name = S.me.name; msg.photo = S.me.photo || ''; S.lastWorldSend = now; }
        if (th.kind === 'dm' && !S.chats[th.id]) {
            const members = [S.uid, th.uid].sort();
            await setDoc(doc(db, 'cchats', th.id), { members, createdAt: now, lastMsg: '', lastAt: 0, lastFrom: '', unread: {} });
            S.chats[th.id] = { id: th.id, members };
        }
        await addDoc(collection(db, pathOf(th)), msg);
        if (th.kind === 'dm') await updateDoc(doc(db, 'cchats', th.id), { lastMsg: text.slice(0, 60), lastAt: now, lastFrom: S.uid, ['unread.' + th.uid]: increment(1) });
        if (th.kind === 'group') { const g = S.groups[th.id] || {}, up = { lastMsg: text.slice(0, 60), lastAt: now, lastFrom: S.uid }; (g.members || []).forEach(m => { if (m !== S.uid) up['unread.' + m] = increment(1); }); await updateDoc(doc(db, 'cgroups', th.id), up); }
    } catch (e) { ta.value = text; window.chat.grow(ta); toast(e.code === 'permission-denied' ? "Message not sent — you can't message this user" : errMsg(e)); }
}
async function doEdit(text) {
    const th = S.th, id = S.editing; const m = S.thMsgs.find(x => x.id === id);
    if (!m || Date.now() - m.at >= EDIT_MS) { cancelEdit(); return toast('Edit time (10 min) is over'); }
    try { await updateDoc(doc(db, pathOf(th), id), { text, edited: true }); cancelEdit(); } catch (e) { toast(errMsg(e)); }
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
    $('ct-edit').classList.remove('hidden'); const ta = $('ct-text'); ta.value = m.text; window.chat.grow(ta); ta.focus();
}
export async function delMsg(id) {
    const ok = await ask({ icon: 'fa-trash', title: 'Delete this message?', text: 'It will be removed for everyone.', yes: 'Delete', danger: true }); if (!ok) return;
    const m = S.thMsgs.find(x => x.id === id); if (!m || Date.now() - m.at >= EDIT_MS) return toast('Delete time (10 min) is over');
    try { await updateDoc(doc(db, pathOf(S.th), id), { deleted: true, text: '' }); toast('Message deleted'); } catch (e) { toast(errMsg(e)); }
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
    sheet(`<div class="cs-t">${esc(g.emoji || '👥')} ${esc(g.name)}</div><div class="cs-p">${g.members.length} members</div><div class="cs-list">${g.members.map(m => `<div class="cs-mem">${avatar(S.prof[m].name, S.prof[m].photo)}<b>${esc(m === S.uid ? 'You' : friendName(m))}</b>${m === g.owner ? '<em>owner</em>' : ''}</div>`).join('')}</div>`);
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
        <div class="cs-list cs-pick">${S.fr.list.map(f => `<div class="cs-mem pick" id="gp-${f}" onclick="chat.grpPick('${f}')">${avatar(S.prof[f].name, S.prof[f].photo)}<b>${esc(friendName(f))}</b><i class="fa-regular fa-circle"></i></div>`).join('')}</div>
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
