/**
 * Chat "keep" layer:
 *   • Browser notifications for new messages (service worker for Android/PWA, plain Notification fallback)
 *   • Red dots: bottom-nav Chat icon, chat tabs, conversation rows, world room, page title
 *   • 24-hour message life (client hides expired messages, lazily deletes them; admin server also cleans up)
 *   • "Save to this device" — per message, or auto-keep a whole chat — stored in IndexedDB on the phone/PC,
 *     so it survives after the server deletes the message.
 * Everything talks to chat.js only through its HK hooks + window.chat, so the old code stays small.
 */
import * as core from './chat.js';
import { collection, query, where, orderBy, limit, onSnapshot, getDocs, deleteDoc, doc, onAuthStateChanged, authService } from '../../js/core/firebase.js';
import { chatDb as db } from '../../js/core/chat-firebase.js';

const { S, HK, esc, ttlMs, alive, friendName, pathOf, sheet, sheetClose, ask, toast, EDIT_MS } = core;
const $ = (id) => document.getElementById(id);
const BASE_TITLE = document.title;
const ICON = new URL('assets/icons/icon-192.png', document.baseURI).href;
const SUPPORTED = 'Notification' in window;
const DAY = 86400000;

/* ================================ prefs (per user, on this device) ================================ */
const pkey = () => 'ffk_' + (S.uid || (authService.currentUser && authService.currentUser.uid) || 'guest');
const prefs = () => { try { return JSON.parse(localStorage.getItem(pkey()) || '{}'); } catch (e) { return {}; } };
const getPref = (k, d) => { const p = prefs(); return p[k] === undefined ? d : p[k]; };
const setPref = (k, v) => { const p = prefs(); p[k] = v; try { localStorage.setItem(pkey(), JSON.stringify(p)); } catch (e) {} };
const roomKey = (th) => th.kind + ':' + th.id;
const inList = (k, key) => (getPref(k, []) || []).includes(key);
const toggleList = (k, key) => { const l = new Set(getPref(k, []) || []); l.has(key) ? l.delete(key) : l.add(key); setPref(k, [...l]); return l.has(key); };

/* ================================ IndexedDB: saved messages ================================ */
let idbP = null; const mem = new Map(); let idbOk = true;
function idb() {
    if (idbP) return idbP;
    idbP = new Promise((res) => {
        try {
            const r = indexedDB.open('ffchat', 1);
            r.onupgradeneeded = () => { const s = r.result.createObjectStore('saved', { keyPath: 'k' }); s.createIndex('uid', 'uid'); };
            r.onsuccess = () => res(r.result); r.onerror = () => { idbOk = false; res(null); }; r.onblocked = () => { idbOk = false; res(null); };
        } catch (e) { idbOk = false; res(null); }
    });
    return idbP;
}
const tx = async (mode, fn) => { const d = await idb(); if (!d) return null; return new Promise((res) => { try { const t = d.transaction('saved', mode), s = t.objectStore('saved'); const out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : true); t.onerror = () => res(null); t.onabort = () => res(null); } catch (e) { res(null); } }); };
async function dbPut(items) { if (!items.length) return; items.forEach(i => mem.set(i.k, i)); await tx('readwrite', (s) => items.forEach(i => s.put(i))); }
async function dbDel(keys) { keys.forEach(k => mem.delete(k)); await tx('readwrite', (s) => keys.forEach(k => s.delete(k))); }
async function dbList() {
    const uid = S.uid; let rows = [];
    const d = await idb();
    if (d) rows = await new Promise((res) => { try { const r = d.transaction('saved').objectStore('saved').index('uid').getAll(uid); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); } catch (e) { res([]); } });
    mem.forEach(v => { if (v.uid === uid && !rows.find(x => x.k === v.k)) rows.push(v); });
    return rows;
}
let savedKeys = new Set();
async function loadSavedKeys() { savedKeys = new Set((await dbList()).map(r => r.k)); }
const mkRec = (m, th) => ({ k: `${S.uid}|${roomKey(th)}|${m.id}`, uid: S.uid, room: roomKey(th), roomName: th.name || (th.kind === 'world' ? S.world.name : 'Chat'), kind: th.kind, id: m.id, from: m.from, name: m.name || (m.from === S.uid ? 'You' : friendName(m.from)), text: core.parseMsg(m).text || '', at: m.at, savedAt: Date.now() });

/* ================================ notifications ================================ */
let reg = null;
async function swRegister() {
    if (reg || !('serviceWorker' in navigator) || !(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return reg;
    try { reg = await navigator.serviceWorker.register('sw.js'); } catch (e) { reg = null; }
    return reg;
}
const perm = () => SUPPORTED ? Notification.permission : 'unsupported';
const alertsOn = () => perm() === 'granted' && getPref('notif', true) !== false;

async function enableAlerts() {
    if (!SUPPORTED) { toast('This browser cannot show notifications. On iPhone: Share → Add to Home Screen first.'); return false; }
    let p = Notification.permission;
    if (p === 'default') { try { p = await Notification.requestPermission(); } catch (e) { p = 'denied'; } }
    if (p === 'granted') { setPref('notif', true); await swRegister(); toast('Message alerts are ON 🔔'); try { sendBrowser('FF Cash Battle', 'Alerts are working — you will see new messages here.', 'ff-test', { }); } catch (e) {} }
    else if (p === 'denied') toast('Alerts are blocked. Allow notifications for this site in your browser settings.');
    paintAll(); return p === 'granted';
}
function sendBrowser(title, body, tag, data) {
    if (!alertsOn()) return;
    const opts = { body, tag, renotify: true, icon: ICON, badge: ICON, vibrate: [90, 50, 90], data: data || {} };
    const fallback = () => { try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); n.close(); openRoom(data); }; } catch (e) {} };
    if (reg && reg.showNotification) reg.showNotification(title, opts).catch(fallback); else fallback();
}
const playSound = () => { if (getPref('sound', true) !== false) { try { window.sfx && window.sfx.play('notification'); } catch (e) {} } };
function announce(title, body, tag, data) {
    const hidden = document.hidden || !document.hasFocus();
    playSound();
    if (hidden) sendBrowser(title, body, tag, data);
    else if (window.ui && window.ui.notify) {
        window.ui.notify({ type: 'info', title, message: body, duration: 5200 });
        if (alertsOn() && !S.opened) { /* in-app toast is enough while the page is in front */ }
    }
    if (navigator.vibrate && hidden === false) { try { navigator.vibrate(40); } catch (e) {} }
}

/* ---- incoming message detection (cchats / cgroups last-message fields) ---- */
const baseline = {};
HK.onChats = (prev, next, kind) => {
    const first = !baseline[kind]; baseline[kind] = true;
    if (!first) {
        for (const id in next) {
            const c = next[id], p = prev && prev[id];
            if (!c.lastAt || !c.lastFrom || c.lastFrom === S.uid) continue;
            if (p && c.lastAt <= (p.lastAt || 0)) continue;
            if (!alive({ at: c.lastAt })) continue;
            if (S.th && S.th.id === id && S.opened && !document.hidden) continue;           // you are looking at it
            if (kind === 'dm' && S.bl.includes(c.lastFrom)) continue;
            if (inList('muted', kind + ':' + id)) continue;
            const other = kind === 'dm' ? (c.members || []).find(m => m !== S.uid) : null;
            const title = kind === 'dm' ? friendName(other || c.lastFrom) : (c.name || 'Group');
            announce(title, c.lastMsg || 'New message', kind + id, { kind, id, uid: other || '' });
        }
    }
    recount();
};

/* ================================ red dots ================================ */
let worldFlag = false;
const unreadOf = (map) => { let n = 0; Object.values(map || {}).forEach(c => { if (c.unread && c.unread[S.uid] && !inList('muted', (c.members && c.members.length === 2 ? 'dm:' : 'group:') + c.id)) n += c.unread[S.uid]; }); return n; };
function recount() {
    const rf = !!window.chat._replyFlag, msgs = unreadOf(S.chats) + unreadOf(S.groups), req = (S.inc || []).length, total = msgs + req + (worldFlag || rf ? 1 : 0);
    const dot = $('nav-chat-dot'); if (dot) { dot.textContent = msgs + req > 99 ? '99+' : (msgs + req || ''); dot.classList.toggle('on', total > 0); dot.classList.toggle('plain', total > 0 && !(msgs + req)); }
    document.title = total ? `(${total > 99 ? '99+' : total}) ${BASE_TITLE}` : BASE_TITLE;
    try { if (navigator.setAppBadge) total ? navigator.setAppBadge(total) : navigator.clearAppBadge(); } catch (e) {}
    const wd = $('wr-dot'); if (wd) { wd.classList.toggle('on', worldFlag || rf); wd.classList.toggle('reply', rf); }
    return total;
}
async function checkWorld() {
    if (!S.me) return;
    try {
        const s = await getDocs(query(collection(db, 'cworld'), orderBy('at', 'desc'), limit(1)));
        const m = s.docs[0] && s.docs[0].data();
        worldFlag = !!(m && m.at > getPref('lastWorld', 0) && m.from !== S.uid && alive(m));
        recount();
    } catch (e) { }
}
HK.onOpen = (th) => {
    if (th.kind === 'world') { setPref('lastWorld', Date.now()); worldFlag = false; window.chat.markRepliesSeen && window.chat.markRepliesSeen(); recount(); }
    setTimeout(() => purge(th), 1500);
    clearTimeout(window._ffExp); window._ffExp = setInterval(() => { if (!S.th) return clearInterval(window._ffExp); if (S.thMsgs.some(m => !alive(m))) { S.thMsgs = S.thMsgs.filter(alive); window.chat.renderMsgs(); } else if (S.thMsgs.some(m => m.at && ttlMs() - (Date.now() - m.at) < 3600000)) window.chat.renderMsgs(); }, 60000);
};
HK.onClose = () => { clearInterval(window._ffExp); recount(); paintAll(); };
HK.onMsgs = (th, msgs) => {
    if (th.kind === 'world') { setPref('lastWorld', Date.now()); }
    if (th.kind === 'world' && msgs.length && msgs[msgs.length - 1].from !== S.uid && document.hidden && getPref('world', false) && !inList('muted', 'world:world')) {
        const m = msgs[msgs.length - 1]; if (Date.now() - m.at < 15000) announce(S.world.name || 'World chat', `${m.name || 'Player'}: ${m.text}`, 'world', { kind: 'world', id: 'world' });
    }
};

/* ================================ expiry ================================ */
export const ttlLabel = () => { const h = ttlMs() / 3600000; return h % 24 === 0 ? (h / 24 === 1 ? '24 hours' : (h / 24) + ' days') : h + ' hours'; };
const leftText = (m) => { const l = ttlMs() - (Date.now() - m.at); if (l <= 0) return 'expired'; const h = Math.floor(l / 3600000), mi = Math.floor((l % 3600000) / 60000); return h ? `${h}h ${mi}m` : `${mi}m`; };
/** Delete expired messages of this chat from the database (rules allow it only after 24h; the admin server also cleans up). */
async function purge(th) {
    try {
        const key = 'ffp_' + roomKey(th), last = Number(localStorage.getItem(key) || 0);
        if (Date.now() - last < 3600000) return; localStorage.setItem(key, String(Date.now()));
        const cutoff = Date.now() - Math.max(ttlMs(), DAY);
        const s = await getDocs(query(collection(db, pathOf(th)), where('at', '<', cutoff), limit(40)));
        for (const d of s.docs) { try { await deleteDoc(doc(db, pathOf(th), d.id)); } catch (e) { break; } }
    } catch (e) { }
}

/* ================================ saved messages ================================ */
async function saveMsg(id) {
    const m = S.thMsgs.find(x => x.id === id); if (!m || !S.th) return;
    if (!idbOk) toast('Storage is limited on this browser — saved only until you close the app');
    await dbPut([mkRec(m, S.th)]); savedKeys.add(mkRec(m, S.th).k); toast('Saved on this device ✓'); window.chat.renderMsgs();
}
async function unsaveMsg(id) { const m = S.thMsgs.find(x => x.id === id); if (!m || !S.th) return; const k = mkRec(m, S.th).k; await dbDel([k]); savedKeys.delete(k); toast('Removed from saved'); window.chat.renderMsgs(); }
export const isSavedMsg = (m) => !!S.th && savedKeys.has(`${S.uid}|${roomKey(S.th)}|${m.id}`);

const bg = new Map();                    // auto-keep listeners (one per chosen chat)
function startBg() {
    const want = new Set(getPref('auto', []) || []);
    bg.forEach((u, k) => { if (!want.has(k)) { u(); bg.delete(k); } });
    want.forEach((rk) => {
        if (bg.has(rk)) return; const [kind, ...r] = rk.split(':'), id = r.join(':'); if (!kind || !id) return;
        const th = { kind, id }; let name = kind === 'world' ? (S.world.name || 'World') : kind === 'group' ? ((S.groups[id] || {}).name || 'Group') : friendName(id.split('_').find(x => x !== S.uid) || '');
        const u = onSnapshot(query(collection(db, pathOf(th)), where('at', '>', Date.now() - ttlMs()), orderBy('at', 'desc'), limit(100)), (s) => {
            const recs = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => !m.deleted && core.parseMsg(m).text).map(m => ({ ...mkRec(m, { ...th, name }), savedAt: Date.now(), auto: 1 })).filter(r => !savedKeys.has(r.k));
            recs.forEach(r => savedKeys.add(r.k)); dbPut(recs);
        }, () => {});
        bg.set(rk, u);
    });
}
async function toggleAuto() {
    const th = S.th; if (!th) return; const rk = roomKey(th); const on = !inList('auto', rk);
    if (on) { const ok = await ask({ icon: 'fa-floppy-disk', title: 'Keep a copy of this chat?', text: 'New messages in this chat are also saved on THIS device, so they stay after the server deletes them (after ' + ttlLabel() + '). Uses a little phone / PC storage.', yes: 'Keep copy' }); if (!ok) return; }
    toggleList('auto', rk); startBg(); core.closeMenu(); toast(on ? 'Auto-keep ON for this chat' : 'Auto-keep OFF'); paintAll();
}
function toggleMute() { const th = S.th; if (!th) return; const rk = roomKey(th); const on = toggleList('muted', rk); core.closeMenu(); toast(on ? 'Alerts muted for this chat' : 'Alerts back on'); recount(); }

/* ---- saved sheet ---- */
const fmtDT = (ms) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
async function storageLine() {
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); const mb = (n) => (n / 1048576).toFixed(n > 1e8 ? 0 : 1); return `Device storage: ${mb(e.usage || 0)} MB used of ${mb(e.quota || 0)} MB available`; } } catch (e) { }
    return '';
}
async function openSaved() {
    sheet('<div class="sv-load"><i></i><i></i><i></i></div>', 'sv');
    const rows = (await dbList()).sort((a, b) => a.at - b.at), groups = {};
    rows.forEach(r => (groups[r.room] = groups[r.room] || { name: r.roomName, kind: r.kind, items: [] }).items.push(r));
    const info = await storageLine();
    const body = rows.length ? Object.entries(groups).map(([rk, g]) => `<div class="sv-grp"><div class="sv-gh"><i class="fa-solid ${g.kind === 'dm' ? 'fa-user' : g.kind === 'group' ? 'fa-users' : 'fa-earth-asia'}"></i><b>${esc(g.name)}</b><em>${g.items.length}</em>${inList('auto', rk) ? '<span class="sv-auto"><i class="fa-solid fa-floppy-disk"></i> auto</span>' : ''}</div>
        ${g.items.map(r => `<div class="sv-it"><div class="sv-t"><b>${esc(r.name)}</b><span>${esc(r.text)}</span><small>${fmtDT(r.at)}</small></div><div class="sv-b"><button onclick="chat.svCopy('${esc(r.k)}')" aria-label="Copy"><i class="fa-regular fa-copy"></i></button><button class="red" onclick="chat.svDel('${esc(r.k)}')" aria-label="Delete"><i class="fa-solid fa-trash"></i></button></div></div>`).join('')}</div>`).join('')
        : `<div class="empty small"><i class="fa-regular fa-bookmark"></i><b>Nothing saved yet</b><span>Tap any message → <b>Save on this device</b>, or turn on <b>Keep a copy</b> in a chat's ⋮ menu.</span></div>`;
    $('cs').innerHTML = `<i class="cs-h"></i><div class="hs-top"><b><i class="fa-solid fa-bookmark" style="color:#f59e0b"></i> Saved on this device</b><button class="hs-x" onclick="chat.sheetClose()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="sv-note"><i class="fa-solid fa-circle-info"></i> Messages vanish from the server after ${ttlLabel()}. Copies saved here stay on this phone / PC until you delete them.</div>
        <div class="hs-body sv-body">${body}</div>
        <div class="sv-foot">${info ? `<small>${esc(info)}</small>` : ''}${rows.length ? `<div class="cs-btns"><button class="cs-b no" onclick="chat.svExport()"><i class="fa-solid fa-file-arrow-down"></i> Export .txt</button><button class="cs-b yes red" onclick="chat.svClear()">Delete all</button></div>` : ''}</div>`;
}
async function svDel(k) { await dbDel([k]); savedKeys.delete(k); openSaved(); }
async function svCopy(k) { const r = (await dbList()).find(x => x.k === k); if (!r) return; copyText(r.text); }
async function svClear() {
    const ok = await ask({ icon: 'fa-trash', title: 'Delete all saved messages?', text: 'This removes every copy stored on this device. It cannot be undone.', yes: 'Delete all', danger: true }); if (!ok) return;
    const rows = await dbList(); await dbDel(rows.map(r => r.k)); savedKeys.clear(); toast('Cleared'); openSaved();
}
async function svExport() {
    const rows = (await dbList()).sort((a, b) => a.room.localeCompare(b.room) || a.at - b.at); if (!rows.length) return;
    let out = 'FF Cash Battle — saved chat messages\nExported ' + new Date().toLocaleString() + '\n', cur = '';
    rows.forEach(r => { if (r.room !== cur) { cur = r.room; out += `\n=== ${r.roomName} ===\n`; } out += `[${fmtDT(r.at)}] ${r.name}: ${r.text}\n`; });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out], { type: 'text/plain' })); a.download = 'ff-chat-saved.txt'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function copyText(t) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Copied ✓')).catch(() => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Copied ✓'); } catch (e) { } ta.remove(); }); }

/* ================================ tap a message ================================ */
function msgTap(id) {
    const m = S.thMsgs.find(x => x.id === id); if (!m || m.deleted || !S.th) return;
    const mine = m.from === S.uid, left = EDIT_MS - (Date.now() - m.at), saved = isSavedMsg(m), P = core.parseMsg(m), world = S.th.kind === 'world';
    const nm = m.name || friendName(m.from);
    sheet(`<div class="cs-t">${mine ? 'Your message' : esc(nm)}</div><div class="cs-quote">${esc(P.text)}</div>
        <div class="cs-timer ttl"><i class="fa-regular fa-hourglass-half"></i> Disappears from server in ${leftText(m)}</div>
        <div class="cs-list">
          <button class="pri" onclick="chat.replyTo('${id}')"><i class="fa-solid fa-reply"></i> Reply</button>
          ${!mine && world ? `<button onclick="chat.openDm('${m.from}')"><i class="fa-solid fa-paper-plane" style="color:#6366f1"></i> Message ${esc(nm)}</button>` : ''}
          <button onclick="chat.mCopy('${id}')"><i class="fa-regular fa-copy"></i> Copy text</button>
          <button class="${saved ? 'on' : ''}" onclick="chat.${saved ? 'mUnsave' : 'mSave'}('${id}')"><i class="fa-${saved ? 'solid' : 'regular'} fa-bookmark" style="color:#f59e0b"></i> ${saved ? 'Remove from saved' : 'Save on this device'}</button>
          ${mine && left > 0 ? `<button onclick="chat.editStart('${id}')"><i class="fa-solid fa-pen"></i> Edit message <small>${Math.floor(left / 60000)}m left</small></button><button class="red" onclick="chat.delMsg('${id}')"><i class="fa-solid fa-trash"></i> Delete message</button>` : ''}
          ${mine && left <= 0 ? `<div class="cs-hint"><i class="fa-regular fa-clock"></i> Edit / delete works for 10 minutes after sending</div>` : ''}
        </div>`, 'cs-sm');
}

/* ================================ UI pieces ================================ */
function settingsCard() {
    const p = perm(), on = alertsOn();
    const state = !SUPPORTED ? 'Not supported here' : p === 'denied' ? 'Blocked in browser settings' : on ? 'On' : p === 'granted' ? 'Off' : 'Tap to allow';
    const sw = (id, label, sub, checked, fn) => `<label class="kp-row"><span class="kp-t"><b>${label}</b><small>${sub}</small></span><span class="kp-sw"><input type="checkbox" ${checked ? 'checked' : ''} onchange="${fn}"><i></i></span></label>`;
    return `<div class="kp-card"><div class="sec-h" style="margin-top:0"><span><i class="fa-solid fa-bell"></i> Alerts &amp; storage</span></div>
        ${sw('n', 'Message alerts', state + ' · browser notification + sound for new messages', on, 'chat.kpAlerts(this)')}
        ${sw('w', 'World chat alerts', 'Notify for World room messages (can be noisy)', getPref('world', false), "chat.kpPref('world',this.checked)")}
        ${sw('s', 'Sound', 'Play a sound when a message arrives', getPref('sound', true) !== false, "chat.kpPref('sound',this.checked)")}
        <button class="kp-saved" onclick="chat.openSaved()"><i class="fa-solid fa-bookmark"></i><span><b>Saved on this device</b><small>${savedKeys.size} message${savedKeys.size === 1 ? '' : 's'} · stays after the server deletes them</small></span><i class="fa-solid fa-chevron-right"></i></button>
        <div class="kp-note"><i class="fa-solid fa-hourglass-half"></i> Messages live for <b>${ttlLabel()}</b> on the server, then are deleted automatically.</div></div>`;
}
function landingAlert() {
    const el = $('cl-alert'); if (!el) return;
    if (!S.me || !SUPPORTED || perm() !== 'default' || getPref('askedHide', false)) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="cl-ask"><i class="fa-solid fa-bell"></i><div><b>Never miss a message</b><small>Turn on alerts — we'll notify you when a friend messages.</small></div><button onclick="chat.kpEnable()">Turn on</button><button class="x" onclick="chat.kpHide()" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button></div>`;
}
function paintAll() { try { landingAlert(); recount(); } catch (e) { } }

function openRoom(d) {
    if (!d || !d.kind) { try { window.nav.goto('chat'); } catch (e) { } return; }
    try { window.focus(); } catch (e) { }
    (async () => {
        try { window.nav.goto('chat'); await window.chat.open(); if (!S.me) return; const uid = d.uid || (d.kind === 'dm' ? String(d.id).split('_').find(x => x !== S.uid) : ''); window.chat.openThread(d.kind, d.id, uid); } catch (e) { }
    })();
}

/* ================================ wire into window.chat ================================ */
const chat = window.chat;
Object.assign(chat, {
    msgTap, openSaved, svDel, svCopy, svClear, svExport,
    mCopy: (id) => { const m = S.thMsgs.find(x => x.id === id); sheetClose(); if (m) copyText(core.parseMsg(m).text); },
    mSave: async (id) => { sheetClose(); await saveMsg(id); },
    mUnsave: async (id) => { sheetClose(); await unsaveMsg(id); },
    kpEnable: enableAlerts, kpHide: () => { setPref('askedHide', true); paintAll(); },
    kpAlerts: async (el) => { if (el.checked) { const ok = await enableAlerts(); if (!ok) el.checked = false; setPref('notif', ok); } else { setPref('notif', false); toast('Alerts off'); } chat.renderAll(); },
    kpPref: (k, v) => { setPref(k, !!v); toast('Saved'); },
    ttlLabel, isSavedMsg, leftText, alive, settingsCard, openRoom, recount,
    onWorldReply: (m, n) => { announce(`${m.name || 'Someone'} replied to you`, core.parseMsg(m).text || 'Tap to see', 'wreply', { kind: 'world', id: 'world' }); }
});
const _tm = chat.threadMenu;
chat.threadMenu = function () {
    _tm.call(chat); const m = $('ct-menu'); const th = S.th;
    if (!th || m.classList.contains('hidden')) return;
    const rk = roomKey(th), auto = inList('auto', rk), mute = inList('muted', rk);
    m.insertAdjacentHTML('beforeend', `<button onclick="chat.kpAuto()"><i class="fa-solid fa-floppy-disk" style="color:#6366f1"></i>${auto ? 'Stop keeping copy' : 'Keep a copy on device'}</button><button onclick="chat.openSaved()"><i class="fa-solid fa-bookmark" style="color:#f59e0b"></i>Saved messages</button><button onclick="chat.kpMute()"><i class="fa-solid ${mute ? 'fa-bell' : 'fa-bell-slash'}"></i>${mute ? 'Unmute alerts' : 'Mute alerts'}</button>`);
    if (th.kind === 'world') $('ct-dots').style.display = '';
};
chat.kpAuto = toggleAuto; chat.kpMute = toggleMute;
const _ra = chat.renderAll; chat.renderAll = function () { _ra.call(chat); paintAll(); };

/* ================================ lifecycle ================================ */
let booting = false;
async function afterLogin() {
    if (booting || !authService.currentUser) return; booting = true;
    try { await swRegister(); await core.boot(); await loadSavedKeys(); startBg(); checkWorld(); window.chat.watchReplies && window.chat.watchReplies(); recount(); paintAll(); } catch (e) { /* chat server asleep or no profile — retried next time */ }
    booting = false;
}
onAuthStateChanged(authService, (u) => {
    if (u) { S.uid = S.uid || u.uid; setTimeout(afterLogin, 3500); }
    else { baseline.dm = baseline.group = false; worldFlag = false; bg.forEach(f => f()); bg.clear(); savedKeys.clear(); recount(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.me) { checkWorld(); recount(); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'open-chat') openRoom(e.data.room); });
swRegister();
// deep link from a notification that opened a fresh tab: ?chat=dm:ID
try { const q = new URLSearchParams(location.search).get('chat'); if (q) { const [kind, ...r] = q.split(':'); setTimeout(() => { const t = setInterval(() => { if (authService.currentUser && S.ready) { clearInterval(t); openRoom({ kind, id: r.join(':') }); } }, 600); setTimeout(() => clearInterval(t), 30000); }, 1500); } } catch (e) { }

/* ================================ on-screen keyboard (phones) ================================ */
// iOS / some Android browsers do not shrink fixed layouts when the keyboard opens: follow the visual viewport instead,
// so the message box is never hidden behind the keyboard.
if (window.visualViewport) {
    const fit = () => {
        const ca = $('chat-app'); if (!ca) return;
        const vv = window.visualViewport, open = document.body.classList.contains('chat-full') && window.innerWidth < 700 && (window.innerHeight - vv.height) > 80;
        if (open) { ca.style.bottom = 'auto'; ca.style.height = vv.height + 'px'; ca.style.top = vv.offsetTop + 'px'; const m = $('ct-msgs'); if (m && S.th) m.scrollTop = m.scrollHeight; }
        else if (ca.style.height) { ca.style.height = ''; ca.style.top = ''; ca.style.bottom = ''; }
    };
    window.visualViewport.addEventListener('resize', fit); window.visualViewport.addEventListener('scroll', fit);
}
