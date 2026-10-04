/**
 * Notifications modal: fetch, clear (animated), claim cash.
 */
import { collection, getDocs, doc, updateDoc, query, orderBy, limit, deleteDoc, dbService } from '../../js/core/firebase.js';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);

// Pick an icon + colour from the notification text
const look = (n) => {
    const t = ((n.title || '') + ' ' + (n.message || '')).toLowerCase();
    if (n.claimAmount) return { icon: 'fa-gift', tone: 'nf-violet' };
    if (/refund|returned|reversed/.test(t)) return { icon: 'fa-rotate-left', tone: 'nf-blue' };
    if (/withdraw/.test(t)) return { icon: 'fa-arrow-up-from-bracket', tone: 'nf-amber' };
    if (/deposit|credited|added to your/.test(t)) return { icon: 'fa-wallet', tone: 'nf-green' };
    if (/not verified|could not|failed|rejected|banned/.test(t)) return { icon: 'fa-triangle-exclamation', tone: 'nf-red' };
    if (/match|room|prize|won|winner|kills|tournament/.test(t)) return { icon: 'fa-trophy', tone: 'nf-amber' };
    return { icon: 'fa-bell', tone: '' };
};

const ago = (ms) => {
    if (!ms) return '';
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    return '';
};

const emptyHtml = () => `<div class="nf-empty">
    <div class="nf-empty-ico"><i class="fa-regular fa-bell"></i></div>
    <b>${esc(window.msg.notif.emptyTitle())}</b>
    <span>${esc(window.msg.notif.emptySub())}</span>
</div>`;

const skeletonHtml = () => '<div class="nf-skel"><i></i><div><b></b><s></s></div></div>'.repeat(3);

const setHeader = (total, unseen) => {
    const c = $('notif-count');
    if (c) {
        c.textContent = unseen > 0 ? unseen + ' new' : (total > 0 ? total + (total === 1 ? ' notification' : ' notifications') : 'No notifications');
        c.classList.toggle('has-new', unseen > 0);
    }
    const b = $('notif-clear-btn');
    if (b) b.classList.toggle('is-disabled', total === 0);
};

const closeConfirm = () => {
    const box = $('notif-confirm');
    if (box) { box.classList.remove('open'); box.setAttribute('aria-hidden', 'true'); }
    const b = $('notif-clear-btn'); if (b) b.classList.remove('is-active');
};

Object.assign(window.app, {
    fetchNotifications: async (opts) => {
        opts = opts || {};
        const list = $('notif-list-container'); const dot = $('notif-dot');
        try {
            const clearedAt = parseInt(localStorage.getItem('notifClearedAt') || '0');
            const seenAt = parseInt(localStorage.getItem('notifSeenAt') || '0');
            let items = [];
            const snap = await getDocs(query(collection(dbService, "notifications"), orderBy("timestamp", "desc"), limit(15)));
            snap.forEach(d => { const n = d.data(); const ms = n.timestamp && n.timestamp.seconds ? n.timestamp.seconds * 1000 : 0; items.push({ title: n.title, message: n.message || n.body, date: n.date, ms }); });
            if (window.db.user_uid) {
                const psnap = await getDocs(collection(dbService, "users", window.db.user_uid, "notifications"));
                psnap.forEach(d => {
                    const n = d.data();
                    const ms = n.timestamp && n.timestamp.seconds ? n.timestamp.seconds * 1000 : 0;
                    items.push({
                        id: d.id, title: n.title, message: n.message || n.body, date: n.date || (ms ? new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''), ms,
                        claimAmount: n.claimAmount, claimType: n.claimType, claimed: !!n.claimed
                    });
                });
            }
            items = items.filter(n => n.ms > clearedAt).sort((a, b) => b.ms - a.ms);
            window.db._notifItems = items;

            // "new" = arrived after the last time the sheet was opened (or a claim that is still waiting)
            const isNew = (n) => n.ms > seenAt || (n.claimAmount && n.id && !n.claimed);
            const unseen = items.filter(isNew).length;
            const sheetOpen = !!(window.ui && $('modal-notifications') && $('modal-notifications').classList.contains('active'));
            const markSeen = opts.markSeen || sheetOpen;

            if (dot) dot.style.display = (unseen > 0 && !markSeen) ? 'block' : 'none';
            setHeader(items.length, unseen);

            if (items.length) {
                list.innerHTML = items.map(n => {
                    const rel = ago(n.ms);
                    const when = rel ? (n.date ? rel + ' · ' + esc(n.date) : rel) : esc(n.date || '');
                    const dateHtml = `<div class="notif-date"><i class="fa-regular fa-clock"></i> ${when}</div>`;
                    if (n.claimAmount && n.id) {
                        const claimedTxt = n.claimed
                            ? `<button class="claim-btn" disabled><i class="fa-solid fa-check"></i> Claimed</button>`
                            : `<button class="claim-btn" onclick="app.claimCash('${esc(n.id)}',${Number(n.claimAmount)},'${esc(n.claimType || 'deposit')}',this)"><i class="fa-solid fa-hand-holding-dollar"></i> Claim ₹${Number(n.claimAmount).toFixed(2)}</button>`;
                        return `<div class="claim-card">
                            <div class="claim-top"><div class="claim-gift"><i class="fa-solid fa-gift"></i></div><div class="notif-title" style="margin:0;">${esc(n.title)}</div></div>
                            <div class="claim-amt">₹${Number(n.claimAmount).toFixed(2)}</div>
                            <div class="notif-msg" style="margin-bottom:12px;">${esc(n.message || window.msg.notif.claimBody())}</div>
                            ${claimedTxt}
                            ${dateHtml}
                        </div>`;
                    }
                    const lk = look(n);
                    const fresh = isNew(n);
                    return `<div class="notif-card ${lk.tone}${fresh ? ' nf-unseen' : ''}">
                        <div class="nf-ico"><i class="fa-solid ${lk.icon}"></i></div>
                        <div class="nf-body">
                            <div class="nf-top"><div class="notif-title">${esc(n.title)}</div>${fresh ? '<span class="nf-new-badge">NEW</span>' : ''}</div>
                            <div class="notif-msg">${esc(n.message || window.msg.notif.emptyBody())}</div>
                            ${dateHtml}
                        </div>
                    </div>`;
                }).join('');
                list.querySelectorAll('.notif-card, .claim-card').forEach((el, i) => el.style.setProperty('--i', Math.min(i, 8)));
            } else {
                list.innerHTML = emptyHtml();
            }
            if (markSeen) { try { localStorage.setItem('notifSeenAt', Date.now().toString()); } catch (e) {} }
        } catch (e) {
            if (list) list.innerHTML = `<div class="nf-empty"><div class="nf-empty-ico"><i class="fa-solid fa-wifi"></i></div><b>${esc(window.msg.notif.loadFailed())}</b></div>`;
        }
    },

    // Step 1: show the inline confirm panel (instead of the browser confirm box)
    clearNotifications: () => {
        const items = window.db._notifItems || [];
        if (!items.length) return window.ui.toast(window.msg.notif.clearNothing());
        const box = $('notif-confirm'); if (!box) return;
        if (box.classList.contains('open')) return closeConfirm();      // second tap on Clear closes it
        $('notif-confirm-title').textContent = window.msg.notif.clearTitle();
        $('notif-confirm-sub').textContent = window.msg.notif.clearConfirm();
        $('notif-confirm-yes').textContent = window.msg.notif.clearYes();
        $('notif-confirm-no').textContent = window.msg.notif.clearNo();
        box.classList.add('open'); box.setAttribute('aria-hidden', 'false');
        const b = $('notif-clear-btn'); if (b) b.classList.add('is-active');
    },
    cancelClearNotifications: () => closeConfirm(),

    // Step 2: confirmed -> cards fly out one by one, then the empty state pops in
    confirmClearNotifications: async () => {
        const yes = $('notif-confirm-yes'); if (yes && yes.disabled) return;
        if (yes) yes.disabled = true;
        closeConfirm();
        try { const cv = parseInt(localStorage.getItem('vol_clear') || '80'); const s = $('audio-clear'); if (s && cv > 0) { s.volume = cv / 100; s.currentTime = 0; s.play().catch(() => {}); } } catch (e) {}
        localStorage.setItem('notifClearedAt', Date.now().toString());

        const list = $('notif-list-container');
        const cards = [...list.querySelectorAll('.notif-card, .claim-card')];
        cards.forEach((el, i) => { el.style.setProperty('--i', Math.min(i, 7)); el.classList.add('nf-out'); });
        const wait = new Promise(r => setTimeout(r, cards.length ? 450 + Math.min(cards.length - 1, 7) * 55 : 0));

        // Delete all personal notifications from firestore (in parallel with the animation)
        const remote = (async () => {
            try {
                if (window.db.user_uid) {
                    const psnap = await getDocs(collection(dbService, "users", window.db.user_uid, "notifications"));
                    const dels = []; psnap.forEach(d => dels.push(deleteDoc(doc(dbService, "users", window.db.user_uid, "notifications", d.id))));
                    await Promise.all(dels);
                }
            } catch (e) { console.error('clear notif', e); }
        })();

        await Promise.all([wait, remote]);
        window.db._notifItems = [];
        list.innerHTML = emptyHtml();
        setHeader(0, 0);
        const dot = $('notif-dot'); if (dot) dot.style.display = 'none';
        if (yes) yes.disabled = false;
        window.ui.toast(window.msg.notif.cleared());
    },

    openNotifications: () => {
        const bell = $('header-bell');
        if (bell) { bell.classList.remove('bell-shake'); void bell.offsetWidth; bell.classList.add('bell-shake'); }
        const v = parseInt(localStorage.getItem('vol_notification') || '80');
        const ne = $('audio-notification');
        if (ne && v > 0) { ne.volume = v / 100; ne.currentTime = 0; ne.play().catch(() => {}); }
        $('notif-dot').style.display = 'none';
        closeConfirm();
        const list = $('notif-list-container');
        if (list && !list.querySelector('.notif-card, .claim-card')) list.innerHTML = skeletonHtml();
        window.ui.openModal('modal-notifications');
        window.app.fetchNotifications({ markSeen: true });
    },

    claimCash: async (notifId, amount, type, btn) => {
        // SECURITY: a user cannot increase their own balance. The admin credits rewards directly.
        // This button only marks old claim notifications as "claimed".
        if (!window.db.user_uid) return window.ui.toast('Please login first');
        if (!notifId) return;
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ...'; }
        try {
            const nref = doc(dbService, "users", window.db.user_uid, "notifications", notifId);
            await updateDoc(nref, { claimed: true, claimedAt: Date.now() });
            window.ui.toast(window.msg.notif.claimInfo());
            window.app.fetchNotifications();
        } catch (e) {
            window.ui.toast('Error: ' + e.message);
            if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-hand-holding-dollar"></i> Claim`; }
        }
    },
});
