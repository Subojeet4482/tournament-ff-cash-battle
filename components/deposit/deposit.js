/**
 * Deposit: UPI + crypto. UPI is verified by UTR *or* Fam/UPI Transaction ID, race-safe (one payment can be credited only once).
 */
import { collection, doc, getDoc, updateDoc, addDoc, serverTimestamp, increment, runTransaction, dbService } from '../../js/core/firebase.js';

Object.assign(window.app, {
    switchDepositTab: (tab) => {
        document.getElementById('dep-upi-section').style.display = tab==='upi'?'block':'none';
        document.getElementById('dep-crypto-section').style.display = tab==='crypto'?'block':'none';
        document.getElementById('dep-tab-upi').classList.toggle('active', tab==='upi');
        document.getElementById('dep-tab-crypto').classList.toggle('active', tab==='crypto');
    },
    _activeDepositPolls: {},
    deposit: async (method) => {
        if(method==='upi'){
            return window.app.depositUPI();
        }
        const amt=document.getElementById('dep-crypto-amount').value;
        const trx=document.getElementById('dep-crypto-hash').value.trim();
        if(!amt) return window.ui.toast(window.msg.deposit.enterAmount());
        if(!trx) return window.ui.toast(window.msg.deposit.needHash());
        if(!window.app.rateLimit('deposit',60000)) return;
        const btn=document.querySelector(`#modal-deposit .btn-main[onclick*="deposit('crypto')"]`); if(btn) btn.disabled=true;
        window.ui.toast("Processing...");
        try {
            await addDoc(collection(dbService,"users",window.db.user_uid,"transactions"),{
                title:window.msg.deposit.title.review(amt),
                amount:`+₹${amt}`, type:"deposit", status:"pending", trxId:trx, method:"CRYPTO",
                date:new Date().toLocaleDateString(), createdAt:Date.now(), timestamp:serverTimestamp()
            });
            window.ui.closeModal(); window.ui.toast(window.msg.deposit.cryptoSent());
            window.app.endAction('deposit',true);
            window.app.fetchTransactions();
        } catch(e){ window.app.endAction('deposit',false); window.ui.toast("Error: "+e.message); }
        finally { if(btn) btn.disabled=false; }
    },
    // ---- reference helpers (UTR or Transaction ID) ----
    // Accepts "FMPIB6862334894", "Transaction ID : FMPIB6862334894", "UTR 412345678901" ...
    extractRef: (raw) => {
        let t = String(raw || '').toUpperCase()
            .replace(/TRANSACTION\s*(ID|NO|NUMBER)?|TXN\s*(ID|NO)?|UPI\s*(REF(ERENCE)?)?\s*(ID|NO)?|REFERENCE\s*(ID|NO|NUMBER)?|REF\s*(ID|NO)?|UTR\s*(NO|NUMBER)?|RRN/g, ' ');
        const m = t.match(/[A-Z0-9]{8,24}/);
        return m ? m[0] : '';
    },
    refKind: (ref) => /^\d{10,14}$/.test(ref) ? 'utr' : /^[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*$/.test(ref) && ref.length >= 10 ? 'txn' : 'other',
    onRefInput: (el) => {
        const box = document.getElementById('dep-ref-detect'); if (!box) return;
        const ref = window.app.extractRef(el.value);
        el.classList.remove('valid', 'invalid'); box.className = 'ref-detect';
        if (!el.value.trim()) { box.innerHTML = '<i class="fa-regular fa-circle"></i><span>Paste your UTR or the Transaction ID from your payment app</span>'; return; }
        if (!ref) { el.classList.add('invalid'); box.classList.add('warn'); box.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><span>Keep typing — UTR / Transaction ID is at least 8 characters</span>'; return; }
        const k = window.app.refKind(ref);
        el.classList.add('valid'); box.classList.add('ok');
        box.innerHTML = k === 'utr' ? '<i class="fa-solid fa-circle-check"></i><span>UTR detected — <b>' + ref + '</b></span>'
            : k === 'txn' ? '<i class="fa-solid fa-circle-check"></i><span>Transaction ID detected — <b>' + ref + '</b></span>'
            : '<i class="fa-solid fa-circle-check"></i><span>Reference detected — <b>' + ref + '</b></span>';
    },
    depositUPI: async () => {
        const amtRaw = document.getElementById('dep-amount').value;
        const ref = window.app.extractRef(document.getElementById('dep-utr').value);   // UTR or Transaction ID
        const amt = parseFloat(amtRaw);
        if (!amt || isNaN(amt)) return window.ui.toast(window.msg.deposit.enterAmount());
        if (amt < 5) return window.ui.toast(window.msg.deposit.minAmount());
        if (!ref) return window.ui.toast(window.msg.deposit.badUtr());
        if (!window.app.rateLimit('deposit_' + ref, 15000)) return;
        const uid = window.db.user_uid;
        if (!uid) return window.ui.toast(window.msg.deposit.needLogin());
        const btn = document.querySelector(`#modal-deposit .btn-main[onclick*="deposit('upi')"]`);
        if (btn) btn.disabled = true;
        const reqRef = doc(dbService, "deposit_requests", ref);      // doc id = the reference => a reference can exist only ONCE
        const now = Date.now();
        let resumed = false;
        try {
            await runTransaction(dbService, async (tx) => {
                const cur = await tx.get(reqRef);
                if (cur.exists()) {
                    const d = cur.data();
                    if (d.status === 'success') throw new Error(window.msg.deposit.utrUsed());
                    if (d.uid && d.uid !== uid) throw new Error(window.msg.deposit.utrOther());
                    if (d.status === 'failed' || d.status === 'mismatch' || d.status === 'rejected') throw new Error(window.msg.deposit.utrRejected());
                    if (d.amount && Math.abs(parseFloat(d.amount) - amt) > 0.01) throw new Error(window.msg.deposit.utrAmount());
                    resumed = true;
                    return;
                }
                tx.set(reqRef, { utr: ref, amount: amt, uid, name: window.db.user_name || 'User', status: 'pending', createdAt: now });
            });
        } catch (e) {
            if (btn) btn.disabled = false;
            return window.ui.toast(e.message || window.msg.deposit.submitFailed());
        }
        try {
            if (!resumed) {
                const trxRef = await addDoc(collection(dbService, "users", uid, "transactions"), {
                    title: window.msg.deposit.title.pending(amt),
                    amount: `+₹${amt}`, type: "deposit", status: "pending", trxId: ref, method: "UPI",
                    date: new Date().toLocaleDateString(), createdAt: now, timestamp: serverTimestamp()
                });
                await updateDoc(reqRef, { trxDocId: trxRef.id });
            }
        } catch (_) {}
        if (btn) btn.disabled = false;
        try { document.getElementById('dep-amount').value = ''; document.getElementById('dep-utr').value = ''; window.app.onRefInput(document.getElementById('dep-utr')); } catch (_) {}
        window.ui.closeModal();
        window.app.startDepositPoll(ref, amt, uid, { overlay: true });
    },
    // One atomic check. Returns {status}: success | used | done | notfound | failed | gone
    //  - success : this call credited the wallet
    //  - used    : the same payment was already credited (under its UTR *or* its Transaction ID)
    //  - done    : this request was already completed (e.g. another tab) — nothing to do
    _checkFampay: async (ref, amt, uid) => {
        const reqRef = doc(dbService, "deposit_requests", ref);
        const fampayRef = doc(dbService, "fampay_deposits", ref);
        return await runTransaction(dbService, async (tx) => {
            const reqSnap = await tx.get(reqRef);
            if (!reqSnap.exists()) return { status: 'gone' };
            const r = reqSnap.data();
            if (r.uid !== uid) return { status: 'failed' };
            if (r.status === 'success') return { status: 'done', trxDocId: r.trxDocId };
            if (r.status !== 'pending' && r.status !== 'processing') return { status: 'failed', trxDocId: r.trxDocId };
            const fSnap = await tx.get(fampayRef);
            if (!fSnap.exists()) return { status: 'notfound', trxDocId: r.trxDocId };
            const f = fSnap.data();
            const fAmt = parseFloat(f.amount);
            if (isNaN(fAmt) || Math.abs(fAmt - parseFloat(r.amount)) > 0.01) return { status: 'notfound', trxDocId: r.trxDocId, received: fAmt };
            // ONE payment = ONE marker (id = the payment's main id). UTR and Transaction ID of the same payment share it,
            // so even two different users / two different references can never both get credited.
            const payId = String(f.payId || ref);
            const usedRef = doc(dbService, "fampay_used", payId);
            const usedSnap = await tx.get(usedRef);
            if (usedSnap.exists()) return { status: 'used', trxDocId: r.trxDocId };
            const userRef = doc(dbService, "users", uid);
            const userSnap = await tx.get(userRef);
            if (!userSnap.exists()) throw new Error("User missing");
            tx.set(usedRef, { ref, uid, at: Date.now() });
            tx.update(userRef, { depositBalance: increment(fAmt), totalDeposited: increment(fAmt), lastDepositUtr: ref });
            tx.update(reqRef, { status: 'success', verifiedAt: Date.now(), receivedAmount: fAmt, claimed: true });
            tx.delete(fampayRef);
            return { status: 'success', amount: fAmt, trxDocId: r.trxDocId };
        });
    },
    _depositNotify: async (uid, title, body) => {
        try {
            await addDoc(collection(dbService, "users", uid, "notifications"), {
                title, body, message: body, type: 'deposit', read: false, date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), createdAt: Date.now(), timestamp: serverTimestamp()
            });
        } catch (_) {}
    },
    startDepositPoll: (ref, amt, uid, opts) => {
        opts = opts || {};
        const A = window.app, ov = { amount: amt, ref };
        if (A._activeDepositPolls[ref]) {
            if (opts.overlay) A._showVerifyOverlay(window.msg.deposit.alreadyChecking.title, window.msg.deposit.alreadyChecking.sub, 'loading', ov);
            return;
        }
        A._activeDepositPolls[ref] = true;
        const reqRef = doc(dbService, "deposit_requests", ref);
        let lastSeen = null, finished = false;
        const finish = () => { finished = true; delete A._activeDepositPolls[ref]; };

        const onSuccess = async (received, trxDocId) => {
            if (trxDocId) { try { await updateDoc(doc(dbService, "users", uid, "transactions", trxDocId), { status: 'success', title: window.msg.deposit.title.success(received) }); } catch (_) {} }
            { const n = window.msg.deposit.successNotify(received, ref); await A._depositNotify(uid, n.title, n.body); }
            try { await A.fetchUserData(); } catch (_) {}
            try { await A.fetchTransactions(); } catch (_) {}
            A._hideVerifyOverlay();
            // 3-second golden-coin animation -> wallet, balance counts up
            window.walletfx.deposit(received, window.db.balance || 0);
        };
        const onFail = async (trxDocId) => {
            const F = window.msg.deposit.fail(amt, ref, lastSeen);
            try { await updateDoc(reqRef, { status: 'failed', failedAt: Date.now() }); } catch (_) {}
            if (trxDocId) { try { await updateDoc(doc(dbService, "users", uid, "transactions", trxDocId), { status: 'failed', title: window.msg.deposit.title.failed(amt) }); } catch (_) {} }
            await A._depositNotify(uid, F.title, F.body);
            try { await A.fetchTransactions(); } catch (_) {}
            if (opts.overlay && !document.hidden) A._showVerifyOverlay(F.title, F.sub, 'fail', ov); else window.ui.toast(F.toast);
        };
        // returns true when polling should stop
        const handle = async (res) => {
            lastSeen = res;
            if (res.status === 'success') { await onSuccess(res.amount, res.trxDocId); finish(); return true; }
            if (res.status === 'used') { await onFail(res.trxDocId); finish(); return true; }
            if (res.status === 'done' || res.status === 'gone') { A._hideVerifyOverlay(); try { await A.fetchUserData(); await A.fetchTransactions(); } catch (_) {} finish(); return true; }
            if (res.status === 'failed') { A._hideVerifyOverlay(); finish(); return true; }
            return false;
        };

        // FOREGROUND: ~10s with the verifying animation
        const runForeground = async () => {
            A._showVerifyOverlay(window.msg.deposit.verifying.title, window.msg.deposit.verifying.sub, 'loading', ov);
            const timer = document.getElementById('dvo-timer');
            let remaining = 10;
            const tick = setInterval(() => { remaining--; if (timer && remaining >= 0) timer.innerText = 'Checking... ' + remaining + 's'; }, 1000);
            for (const wait of [1000, 2000, 2000, 2000, 2000]) {
                await new Promise(r => setTimeout(r, wait));
                try { if (await handle(await A._checkFampay(ref, amt, uid))) { clearInterval(tick); return; } } catch (_) {}
            }
            clearInterval(tick);
            // Not matched yet -> PENDING (never a hard fail here). Keep checking in the background.
            try { await updateDoc(reqRef, { status: 'processing' }); } catch (_) {}
            const P = window.msg.deposit.pending(amt);
            A._showVerifyOverlay(P.title, P.sub, 'pending', ov);
            runBackground();
        };
        // BACKGROUND: every 10s for 5 minutes; a request is marked failed only after 30 minutes without a match
        const runBackground = async () => {
            let attempts = 0, trxDocId = null, createdAt = Date.now();
            try { const s = await getDoc(reqRef); if (s.exists()) { trxDocId = s.data().trxDocId || null; createdAt = s.data().createdAt || createdAt; } } catch (_) {}
            const iv = setInterval(async () => {
                if (finished) { clearInterval(iv); return; }
                attempts++;
                try { if (await handle(await A._checkFampay(ref, amt, uid))) { clearInterval(iv); return; } } catch (_) {}
                if (Date.now() - createdAt > 30 * 60 * 1000) { clearInterval(iv); await onFail(trxDocId); finish(); return; }
                if (attempts >= 30) { clearInterval(iv); delete A._activeDepositPolls[ref]; }   // stays pending; resumes next time the app opens
            }, 10000);
        };
        if (opts.overlay) runForeground(); else runBackground();
    },
});
