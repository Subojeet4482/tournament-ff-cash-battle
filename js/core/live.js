/**
 * REALTIME wallet sync (no reload needed).
 *  - users/{uid}            -> balance, stats, drawer, header, wallet update turant
 *  - users/{uid}/transactions -> wallet + history list live update
 * Top-right toast (6s, close button):
 *  - Deposit / admin balance add  -> "Deposit Credited"
 *  - Withdrawal status -> success -> "Withdrawal Successful"
 */
import { collection, doc, onSnapshot, dbService } from './firebase.js';

window.live = (function () {
    let unsubUser = null, unsubTrx = null, unsubMatch = null, uid = null;

    const stop = () => {
        if (unsubUser) { unsubUser(); unsubUser = null; }
        if (unsubTrx) { unsubTrx(); unsubTrx = null; }
        if (unsubMatch) { unsubMatch(); unsubMatch = null; }
        uid = null;
    };

    function watchUser(id) {
        let prev = null;      // last known {dep, wd}
        let ready = false;    // show toasts only after the first server snapshot arrives
        unsubUser = onSnapshot(doc(dbService, 'users', id), (snap) => {
            if (uid !== id || !snap.exists()) return;
            const d = snap.data();
            const dep = Number(d.depositBalance !== undefined ? d.depositBalance : (d.balance || 0)) || 0;
            const wd = Number(d.withdrawBalance || 0) || 0;

            window.app.applyUserDoc(d);

            if (!ready) { prev = { dep, wd }; if (!snap.metadata.fromCache) ready = true; return; }
            const dDep = +(dep - prev.dep).toFixed(2), dWd = +(wd - prev.wd).toFixed(2);
            prev = { dep, wd };
            // Only when the total balance increased (no toast for deposit<->withdraw transfers)
            if (dDep + dWd <= 0) return;
            const L = window.msg.live;
            if (dDep > 0 && dWd <= 0) { const m = L.depositCredited(dDep); window.ui.notify({ type: 'success', title: m.title, message: m.body, sound: 'notification' }); }
            else if (dWd > 0 && dDep <= 0) { const m = L.balanceCredited(dWd); window.ui.notify({ type: 'success', title: m.title, message: m.body, sound: 'notification' }); }
            else { const m = L.depositCredited(dDep + dWd); window.ui.notify({ type: 'success', title: m.title, message: m.body, sound: 'notification' }); }
        }, () => {});
    }

    function watchTrx(id) {
        const seen = new Map(); // trxId -> normalized status
        let first = true;
        unsubTrx = onSnapshot(collection(dbService, 'users', id, 'transactions'), (snap) => {
            if (uid !== id) return;
            const list = [];
            snap.forEach((s) => {
                const t = s.data();
                t._id = s.id;
                t._ms = t.timestamp && t.timestamp.seconds ? t.timestamp.seconds * 1000 : (t.createdAt || Date.parse(t.date) || 0);
                list.push(t);
            });
            list.sort((a, b) => (b._ms || 0) - (a._ms || 0));
            window.db.trx = list;

            // withdrawal paid -> toast
            list.forEach((t) => {
                const st = window.msg.normStatus(t.status);
                const was = seen.get(t._id);
                seen.set(t._id, st);
                if (first || was === undefined && st !== 'success') return;
                if (String(t.type).toLowerCase() === 'withdraw' && st === 'success' && was !== 'success') {
                    const m = window.msg.live.withdrawPaid(t);
                    window.ui.notify({ type: 'success', title: m.title, message: m.body, sound: 'withdrawal' });
                }
            });
            if (first && !snap.metadata.fromCache) first = false;

            try { window.app.renderWallet(); } catch (e) {}
            const wh = document.getElementById('modal-wallet-history');
            if (wh && wh.classList.contains('active')) { try { window.app.renderWH(); } catch (e) {} }
        }, () => {});
    }

    // Matches in realtime: Room ID / password, result, kills and player count update instantly (no reload)
    function watchMatches(id) {
        const known = new Map(); // matchId -> { room:bool, status }
        let first = true, t = null;
        const startMs = (m) => m.startTime ? (m.startTime.seconds ? m.startTime.seconds * 1000 : new Date(m.startTime).getTime()) : 0;
        unsubMatch = onSnapshot(collection(dbService, 'matches'), (snap) => {
            if (uid !== id) return;
            const list = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
            list.sort((a, b) => startMs(a) - startMs(b));
            window.db.matches = list;

            const joinedIds = window.db.joined_ids || [];
            const fresh = [];
            list.forEach((m) => {
                const room = !!(m.roomId && m.roomPass);
                const prev = known.get(m.id);
                known.set(m.id, { room, status: m.status });
                if (first || !prev || !joinedIds.includes(m.id)) return;
                if (room && !prev.room && m.status !== 'completed') {
                    fresh.push(m.id);
                    window.ui.notify({ type: 'info', title: 'Room ID & Password Ready', message: (m.title || 'Your match') + ' — open My Matches to copy.', sound: 'notification' });
                }
                if (m.status === 'completed' && prev.status !== 'completed') {
                    const me = (m.participants || []).find((p) => p.uid === id) || {};
                    const won = m.winnerUid === id;
                    const amt = me.winAmount != null ? Number(me.winAmount) : (won ? Number(m.prize) || 0 : 0);
                    if (won) window.ui.notify({ type: 'success', title: 'Winner Winner! 🏆', message: `You won ${'₹' + amt} in ${m.title || 'the match'}.`, sound: 'notification' });
                    else if (amt > 0) window.ui.notify({ type: 'success', title: 'Match Result', message: `You earned ${'₹' + amt} (${Number(me.kills) || 0} kills) in ${m.title || 'the match'}.`, sound: 'notification' });
                    else window.ui.notify({ type: 'info', title: 'Match Finished', message: (m.title || 'Match') + ' result is in History.' });
                }
            });
            if (first && !snap.metadata.fromCache) first = false;

            clearTimeout(t);
            t = setTimeout(() => {
                try { if (window.app.renderMatches) window.app.renderMatches(); } catch (e) {}
                const pg = document.getElementById('page-matches');
                if (pg && !pg.classList.contains('hidden')) {
                    try { window.app.renderMyMatches(); } catch (e) {}
                    fresh.forEach((mid) => { const idx = (window.db.matches || []).filter((m) => joinedIds.includes(m.id) && m.status !== 'completed').findIndex((m) => m.id === mid); const el = document.querySelectorAll('#my-matches-list .mx-card')[idx]; if (el) el.classList.add('flash'); });
                }
            }, 350);
        }, () => {});
    }

    function start(id) {
        if (!id) return;
        if (uid === id && unsubUser) return;
        stop(); uid = id;
        watchUser(id); watchTrx(id); watchMatches(id);
    }

    if (window.db && window.db.user_uid) start(window.db.user_uid);
    return { start, stop };
})();
