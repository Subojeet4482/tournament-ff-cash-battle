/**
 * Chat "pro" layer: emoji picker, big-emoji bubbles, drag-to-reply, reply bar, quote jump,
 * user card (World -> Message), and reply notifications in World.
 * Works on top of chat.js / chat-ui.js / chat-keep.js through window.chat.
 */
import * as core from './chat.js';
import { collection, query, where, onSnapshot } from '../../js/core/firebase.js';
import { chatDb as db } from '../../js/core/chat-firebase.js';

const { S, esc, avatar, getProf, sheet, sheetClose, toast, isFriend, friendName, alive } = core;
const $ = (id) => document.getElementById(id);
const chat = window.chat;

/* ================================ emoji ================================ */
const EMO = [
    ['recent', 'fa-clock', 'Recent', ''],
    ['smile', 'fa-face-smile', 'Smileys', '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫡 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 ☠️ 👽 👾 🤖'],
    ['hand', 'fa-hand', 'Gestures', '👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🧠 👀 👁️ 👅 👄'],
    ['heart', 'fa-heart', 'Hearts', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 💣 💬 💭 💤 ✨ ⭐ 🌟 ⚡ 🔥 🌈 ☀️ 🌙 ❄️ 💧 🌊'],
    ['game', 'fa-gamepad', 'Gaming', '🎮 🕹️ 🎯 🎲 🧩 ♟️ 🎰 🎳 🏆 🥇 🥈 🥉 🏅 🎖️ 👑 💎 💰 🪙 💸 💵 🎁 🎉 🎊 🚀 🛡️ ⚔️ 🗡️ 🔫 🧨 🪖 🎧 🔊 📣 🏁 🚩 ⚽ 🏀 🏏 🏸 🥊'],
    ['animal', 'fa-paw', 'Animals', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦅 🦉 🐺 🐗 🐴 🦄 🐝 🦋 🐢 🐍 🦖 🐙 🦈 🐬 🐳'],
    ['food', 'fa-burger', 'Food', '🍎 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🍔 🍟 🍕 🌭 🌮 🌯 🍗 🍖 🍜 🍝 🍣 🍩 🍪 🎂 🍰 🍫 🍿 ☕ 🍵 🥤 🍺'],
];
const recentKey = () => 'ffemo_' + (S.uid || 'g');
const recents = () => { try { return JSON.parse(localStorage.getItem(recentKey()) || '[]'); } catch (e) { return []; } };
const pushRecent = (e) => { const l = [e, ...recents().filter(x => x !== e)].slice(0, 24); try { localStorage.setItem(recentKey(), JSON.stringify(l)); } catch (x) {} };
let emoTab = 'smile', emoOpen = false;

chat.isBigEmoji = (t) => !!t && t.length <= 24 && /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*\s*){1,3}$/u.test(String(t).trim());

function paintEmoji() {
    const p = $('emo-panel'); if (!p) return;
    const rec = recents(); const cur = EMO.find(x => x[0] === emoTab) || EMO[1];
    const list = cur[0] === 'recent' ? rec : cur[3].split(' ');
    p.innerHTML = `<div class="emo-tabs">${EMO.filter(x => x[0] !== 'recent' || rec.length).map(x => `<button type="button" class="${x[0] === cur[0] ? 'on' : ''}" onclick="chat.emojiTab('${x[0]}')" title="${x[2]}"><i class="fa-solid ${x[1]}"></i></button>`).join('')}<button type="button" class="emo-bs" onclick="chat.emojiBack()" title="Backspace"><i class="fa-solid fa-delete-left"></i></button></div>
        <div class="emo-grid">${list.length ? list.map((e, i) => `<button type="button" style="--i:${Math.min(i, 30)}" onclick="chat.emojiPick('${e}',this)">${e}</button>`).join('') : '<p class="emo-empty">Your recent emoji appear here</p>'}</div>`;
}
Object.assign(chat, {
    emojiToggle() { emoOpen ? chat.emojiClose() : chat.emojiOpen(); },
    emojiOpen() { const p = $('emo-panel'); if (!p) return; if (!recents().length && emoTab === 'recent') emoTab = 'smile'; else if (recents().length && emoTab === 'smile' && !emoOpen) emoTab = 'recent'; paintEmoji(); emoOpen = true; $('ct').classList.add('emo-on'); p.classList.add('on'); p.setAttribute('aria-hidden', 'false'); $('ct-emo').classList.add('on'); try { $('ct-text').blur(); } catch (e) {} const m = $('ct-msgs'); setTimeout(() => { m.scrollTop = m.scrollHeight; }, 260); },
    emojiClose(focusing) { const p = $('emo-panel'); emoOpen = false; if (!p) return; p.classList.remove('on'); p.setAttribute('aria-hidden', 'true'); $('ct').classList.remove('emo-on'); $('ct-emo').classList.remove('on'); },
    emojiTab(t) { emoTab = t; paintEmoji(); },
    emojiPick(e, btn) {
        const ta = $('ct-text'); const s = ta.selectionStart == null ? ta.value.length : ta.selectionStart, en = ta.selectionEnd == null ? s : ta.selectionEnd;
        if ((ta.value.length + e.length) > 900) return;
        ta.value = ta.value.slice(0, s) + e + ta.value.slice(en); const pos = s + e.length; ta.setSelectionRange(pos, pos); chat.grow(ta); pushRecent(e);
        if (btn) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); } if (navigator.vibrate) { try { navigator.vibrate(8); } catch (x) {} }
    },
    emojiBack() { const ta = $('ct-text'); const a = Array.from(ta.value); const s = ta.selectionStart; if (s !== ta.selectionEnd) { ta.value = ta.value.slice(0, ta.selectionStart) + ta.value.slice(ta.selectionEnd); } else { const head = Array.from(ta.value.slice(0, s)); head.pop(); const nv = head.join('') + ta.value.slice(s); ta.value = nv; ta.setSelectionRange(head.join('').length, head.join('').length); } chat.grow(ta); },
});
const _close = core.closeThread;
const _ct = chat.closeThread; chat.closeThread = function () { chat.emojiClose(); core.S.reply = null; chat.paintReply(); return _ct.apply(chat, arguments); };

/* ================================ reply bar + quote jump ================================ */
chat.paintReply = function () {
    const bar = $('ct-reply'); if (!bar) return; const r = S.reply;
    bar.classList.toggle('hidden', !r); if (!r) return;
    $('ct-rp-n').textContent = 'Replying to ' + r.n; $('ct-rp-t').textContent = r.t || '…';
    bar.classList.remove('in'); void bar.offsetWidth; bar.classList.add('in');
};
chat.jumpTo = function (id) {
    const el = document.querySelector(`#ct-msgs .mg[data-id="${CSS.escape(id)}"]`);
    if (!el) return toast('That message is no longer here (older than 24h or not loaded)');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800);
};

/* ================================ drag a message to reply ================================ */
(function swipe() {
    const box = $('ct-msgs'); if (!box) return;
    let st = null; const MAX = 84, GO = 62;
    const reset = (el, anim) => { if (!el) return; el.style.transition = anim ? 'transform .38s cubic-bezier(.34,1.56,.64,1)' : 'none'; el.style.transform = ''; const r = el.querySelector('.mg-rp'); if (r) { r.style.opacity = 0; r.style.transform = ''; } };
    box.addEventListener('pointerdown', (e) => {
        const el = e.target.closest('.mg'); if (!el || el.classList.contains('del') || e.button > 0 || e.target.closest('a,button,.mg-av,.mg-n,.mg-q')) return;
        st = { el, x: e.clientX, y: e.clientY, id: el.dataset.id, drag: false, fired: false, id_: e.pointerId };
    }, { passive: true });
    box.addEventListener('pointermove', (e) => {
        if (!st) return; const dx = e.clientX - st.x, dy = e.clientY - st.y;
        if (!st.drag) { if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { st = null; return; } if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.4) return; st.drag = true; st.el.classList.add('dragging'); try { box.setPointerCapture(e.pointerId); } catch (x) {} }
        const d = Math.max(-MAX, Math.min(MAX, dx * .7)), s = Math.sign(d); st.dir = s;
        st.el.style.transition = 'none'; st.el.style.transform = `translateX(${d}px)`;
        const r = st.el.querySelector('.mg-rp'); const pr = Math.min(1, Math.abs(d) / GO);
        if (r) { r.style.opacity = pr; r.style.transform = `scale(${.5 + pr * .6})`; r.classList.toggle('left', s < 0); r.classList.toggle('go', pr >= 1); }
        if (Math.abs(d) >= GO * .7 && !st.fired) { st.fired = true; if (navigator.vibrate) { try { navigator.vibrate(14); } catch (x) {} } }
    }, { passive: true });
    const end = () => { if (!st) return; const { el, drag, fired, id } = st; st = null; el.classList.remove('dragging'); if (!drag) return; reset(el, true); if (fired) chat.replyTo(id); };
    box.addEventListener('pointerup', end, { passive: true }); box.addEventListener('pointercancel', end, { passive: true });
    box.addEventListener('contextmenu', (e) => { if (st && st.drag) e.preventDefault(); });
})();

/* ================================ user card: World -> Message ================================ */
chat.userCard = async function (uid, name, photo) {
    if (!uid || uid === S.uid) return;
    sheet(`<div class="uc-load"><i></i><i></i><i></i></div>`, 'uc');
    const p = (await getProf(uid)) || {}; if (!$('cs-ov').classList.contains('on')) return;
    const nm = p.name || name || friendName(uid), friend = isFriend(uid), priv = !!p.isPrivate && !friend;
    const reqOut = (S.out || []).some(r => r.to === uid), reqIn = (S.inc || []).some(r => r.from === uid), blocked = S.bl.includes(uid);
    $('cs').innerHTML = `<i class="cs-h"></i><button type="button" class="uc-x" aria-label="Close" onclick="chat.sheetClose()"><i class="fa-solid fa-xmark"></i></button><div class="uc"><div class="uc-av">${avatar(nm, p.photo || photo, 'av big')}${p.online ? '<span class="uc-on"></span>' : ''}</div>
        <b class="uc-n">${core.nameH(nm, p.v)}</b>${p.username ? `<small class="uc-u">@${esc(p.username)}</small>` : ''}
        <div class="uc-tags">${friend ? '<span class="g"><i class="fa-solid fa-user-check"></i> Friend</span>' : ''}${p.isPrivate ? '<span><i class="fa-solid fa-lock"></i> Private</span>' : '<span><i class="fa-solid fa-earth-asia"></i> Public</span>'}${p.online ? '<span class="g">Online</span>' : ''}${p.v ? '<span class="vb"><i class="fa-solid fa-circle-check"></i> Verified</span>' : ''}</div>
        <p class="uc-bio">${priv ? 'This profile is private.' : (p.bio ? esc(p.bio) : '<i>No bio yet</i>')}</p>
        <div class="uc-btns">
          <button class="uc-b main" ${blocked ? 'disabled' : ''} onclick="chat.openDm('${uid}')"><i class="fa-solid fa-paper-plane"></i> ${priv ? 'Message (needs friend)' : 'Message'}</button>
          ${friend ? '' : (reqIn ? `<button class="uc-b" onclick="chat.tab('profile');chat.sheetClose()"><i class="fa-solid fa-inbox"></i> Respond to request</button>` : `<button class="uc-b" ${reqOut ? 'disabled' : ''} onclick="chat.sendRequest('${uid}');chat.sheetClose()"><i class="fa-solid fa-user-plus"></i> ${reqOut ? 'Request sent' : 'Add friend'}</button>`)}
          <button class="uc-b red" onclick="chat.reportWorldUser('${uid}','${esc(nm).replace(/'/g, '')}')"><i class="fa-solid fa-flag"></i> Report</button>
        </div></div>`;
};
chat.reportWorldUser = async function (uid, nm) {
    sheetClose();
    const r = await core.ask({ icon: 'fa-flag', title: `Report ${nm}?`, text: 'Our support team will review the World chat.', chips: ['Spam', 'Abuse / harassment', 'Scam / fraud', 'Other'], yes: 'Send report', danger: true }); if (!r) return;
    try { const { addDoc } = await import('../../js/core/firebase.js'); await addDoc(collection(db, 'creports'), { from: S.uid, against: uid, chatId: 'world', kind: 'world', reason: r.val + (r.extra ? ' — ' + r.extra : ''), createdAt: Date.now(), status: 'open', fromName: S.me ? S.me.name : '', againstName: nm }); toast('Report sent to support ✓'); } catch (e) { toast(core.errMsg(e)); }
};

/* ================================ replies to ME in World -> red dot + notification ================================ */
let rpUnsub = null, rpBase = false;
chat.watchReplies = function () {
    if (rpUnsub || !S.uid || !S.me) return;
    rpUnsub = onSnapshot(query(collection(db, 'cworld'), where('ru', '==', S.uid)), (s) => {
        const list = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => alive(m) && m.from !== S.uid).sort((a, b) => b.at - a.at);
        const lastSeen = Number(localStorage.getItem('ffrp_' + S.uid) || 0);
        const fresh = list.filter(m => m.at > lastSeen);
        if (rpBase && fresh.length && window.chat.onWorldReply) window.chat.onWorldReply(fresh[0], fresh.length);
        window.chat._replyFlag = fresh.length > 0 && !(S.th && S.th.kind === 'world');
        rpBase = true; if (window.chat.recount) window.chat.recount();
    }, () => {});
};
chat.markRepliesSeen = function () { try { localStorage.setItem('ffrp_' + S.uid, String(Date.now())); } catch (e) {} window.chat._replyFlag = false; if (chat.recount) chat.recount(); };
