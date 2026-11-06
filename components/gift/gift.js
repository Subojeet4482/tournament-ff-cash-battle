/**
 * Gift code redeem.
 *  - code = exactly 24 characters (any letters / digits / symbols)
 *  - one account can use a code only once (redeems/{uid} is create-only), 5 wrong tries => locked 24h
 *  - the amount comes from the code's pre-shuffled pool (fixed or random) — it is enforced by the Firestore rules
 */
import { doc, getDoc, setDoc, collection, runTransaction, increment, dbService } from '../../js/core/firebase.js';

const $ = (id) => document.getElementById(id);
const MAXTRY = 5, LOCK_MS = 24 * 3600 * 1000;
let busy = false;

const sha256 = async (txt) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
};
const orderNo = (id) => { const d = new Date(); return 'GF-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + id.slice(-6).toUpperCase(); };
const leftStr = (ms) => { const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000); return (h ? h + 'h ' : '') + m + 'm'; };

const paintTries = (fails, locked) => {
    const el = $('gift-tries'); if (!el) return;
    el.innerHTML = Array.from({ length: MAXTRY }, (_, i) => `<i class="${i < fails ? 'x' : ''}"></i>`).join('') + `<span style="margin-left:4px">${locked ? 'locked' : (MAXTRY - fails) + ' tries left'}</span>`;
};
const say = (t, cls) => { const m = $('gift-msg'); m.className = 'gift-msg ' + (cls || ''); m.textContent = t || ''; };
const loadTries = async () => {
    try {
        const s = await getDoc(doc(dbService, 'gift_tries', window.db.user_uid));
        const d = s.exists() ? s.data() : { fails: 0, resetAt: 0 };
        if (d.resetAt && d.resetAt < Date.now()) return { fails: 0, resetAt: 0, exists: s.exists() };   // old fails expired
        return { fails: d.fails || 0, resetAt: d.resetAt || 0, exists: s.exists() };
    } catch (e) { return { fails: 0, resetAt: 0, exists: false }; }
};

Object.assign(window.app, {
    openGift: async () => {
        window.ui.openModal('modal-gift');
        $('gift-input').value = ''; window.app.giftInput($('gift-input')); say('');
        $('gift-hero').classList.remove('win');
        const t = await loadTries();
        const locked = t.fails >= MAXTRY && t.resetAt > Date.now();
        paintTries(t.fails, locked);
        if (locked) { say('Too many wrong tries. Try again in ' + leftStr(t.resetAt - Date.now()), 'err'); }
        setTimeout(() => { try { $('gift-input').focus(); } catch (e) {} }, 350);
    },
    giftInput: (el) => {
        const n = el.value.length;
        $('gift-count').textContent = n + ' / 24';
        $('gift-bar').style.width = (n / 24 * 100) + '%';
        $('gift-btn').disabled = n !== 24;
        $('gift-field').classList.toggle('ok', n === 24); $('gift-field').classList.remove('bad');
        if (n !== 24) say('');
    },
    giftPaste: async () => {
        try { const t = (await navigator.clipboard.readText()).trim().slice(0, 24); $('gift-input').value = t; window.app.giftInput($('gift-input')); } catch (e) { window.ui.toast('Long-press the box to paste'); }
    },
    redeemGift: async () => {
        if (busy) return;
        const code = $('gift-input').value;
        if (code.length !== 24) return;
        if (!window.db.user_uid) return window.ui.toast('Please login first');
        busy = true; const btn = $('gift-btn'); btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking…'; say('');
        const uid = window.db.user_uid;
        try {
            const t = await loadTries();
            if (t.fails >= MAXTRY && t.resetAt > Date.now()) { paintTries(t.fails, true); say('Too many wrong tries. Try again in ' + leftStr(t.resetAt - Date.now()), 'err'); return; }
            const h = await sha256(code);
            const codeRef = doc(dbService, 'gift_codes', h), redRef = doc(dbService, 'gift_codes', h, 'redeems', uid), userRef = doc(dbService, 'users', uid);
            const trxRef = doc(collection(dbService, 'users', uid, 'transactions')), nRef = doc(collection(dbService, 'users', uid, 'notifications'));
            let res;
            try {
                res = await runTransaction(dbService, async (tx) => {
                    const cs = await tx.get(codeRef);
                    if (!cs.exists()) throw { kind: 'invalid' };
                    const c = cs.data();
                    if (c.status !== 'active') throw { kind: 'invalid' };
                    if (c.expiresAt && c.expiresAt < Date.now()) throw { kind: 'expired' };
                    if ((c.used || 0) >= (c.max || 1)) throw { kind: 'full' };
                    const rs = await tx.get(redRef);
                    if (rs.exists()) throw { kind: 'already' };
                    const amount = Number((c.pool || [])[c.used || 0]);
                    if (!(amount > 0)) throw { kind: 'invalid' };
                    const us = await tx.get(userRef); const u = us.data() || {};
                    const field = c.balance === 'withdraw' ? 'withdrawBalance' : 'depositBalance';
                    const cur = field === 'depositBalance' ? (u.depositBalance !== undefined ? u.depositBalance : (u.balance || 0)) : (u.withdrawBalance || 0);
                    const ord = orderNo(trxRef.id), date = new Date().toLocaleDateString(), now = Date.now();
                    tx.set(redRef, { uid, amount, at: now, name: u.appName || 'User', orderNo: ord });
                    tx.update(codeRef, { used: increment(1) });
                    tx.update(userRef, { [field]: Math.round((cur + amount) * 100) / 100, lastGiftHash: h });
                    tx.set(trxRef, { title: `Gift code redeemed: ₹${amount}`, amount: `+₹${amount}`, type: 'deposit', status: 'success', kind: 'gift', giftHash: h, orderNo: ord, balanceType: c.balance === 'withdraw' ? 'withdraw' : 'deposit', date, createdAt: now });
                    tx.set(nRef, { title: `🎁 Gift code: ₹${amount} added`, message: `Order ${ord} — added to your ${c.balance === 'withdraw' ? 'withdrawal' : 'deposit'} balance.`, type: 'gift', read: false, date, createdAt: now });
                    return { amount, balance: c.balance, newBal: Math.round((cur + amount) * 100) / 100, field };
                });
            } catch (e) {
                if (e && e.kind) {
                    // count the wrong try
                    const fails = (t.fails || 0) + 1;
                    try { await setDoc(doc(dbService, 'gift_tries', uid), { fails, resetAt: Date.now() + LOCK_MS }); } catch (_) {}
                    $('gift-field').classList.add('bad'); setTimeout(() => $('gift-field').classList.remove('bad'), 600);
                    paintTries(fails, fails >= MAXTRY);
                    const txt = { invalid: 'Invalid gift code.', expired: 'This gift code has expired.', full: 'This gift code is fully used.', already: 'You have already used this code.' }[e.kind];
                    say(fails >= MAXTRY ? 'Too many wrong tries. Locked for 24 hours.' : txt + ' ' + (MAXTRY - fails) + ' tries left.', 'err');
                    return;
                }
                throw e;
            }
            // success
            $('gift-hero').classList.add('win'); say('🎉 ₹' + res.amount + ' added!', 'ok');
            try { await window.app.fetchUserData(); await window.app.fetchTransactions(); } catch (_) {}
            const total = (window.db.balance || 0);
            setTimeout(() => { window.ui.closeModal(); window.walletfx.deposit(res.amount, total, { title: 'Gift Code Redeemed 🎁', sub: 'Adding your gift to the wallet…' }); }, 700);
        } catch (e) {
            say('Could not redeem: ' + (e && e.message ? e.message : 'try again'), 'err');
        } finally { busy = false; btn.innerHTML = '<i class="fa-solid fa-gift"></i> Redeem'; btn.disabled = $('gift-input').value.length !== 24; }
    }
});
