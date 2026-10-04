/**
 * Deposit: UPI + crypto, UTR verification polling.
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
    depositUPI: async () => {
        const amtRaw=document.getElementById('dep-amount').value;
        const utr=document.getElementById('dep-utr').value.trim();
        const amt=parseFloat(amtRaw);
        if(!amt || isNaN(amt)) return window.ui.toast(window.msg.deposit.enterAmount());
        if(amt < 5) return window.ui.toast(window.msg.deposit.minAmount());
        if(!utr || utr.length < 6) return window.ui.toast(window.msg.deposit.badUtr());
        if(!window.app.rateLimit('deposit_'+utr,15000)) return;
        const uid=window.db.user_uid;
        if(!uid) return window.ui.toast(window.msg.deposit.needLogin());
        const btn=document.querySelector(`#modal-deposit .btn-main[onclick*="deposit('upi')"]`);
        if(btn) btn.disabled=true;
        const reqRef=doc(dbService,"deposit_requests",utr);
        const now=Date.now();
        let resumed=false;
        try {
            await runTransaction(dbService, async (tx) => {
                const cur=await tx.get(reqRef);
                if(cur.exists()){
                    const d=cur.data();
                    if(d.status==='success') throw new Error(window.msg.deposit.utrUsed());
                    if(d.uid && d.uid!==uid) throw new Error(window.msg.deposit.utrOther());
                    if(d.status==='failed' || d.status==='mismatch') throw new Error(window.msg.deposit.utrRejected());
                    if(d.amount && Math.abs(parseFloat(d.amount)-amt)>0.01) throw new Error(window.msg.deposit.utrAmount());
                    resumed=true;
                    return;
                }
                tx.set(reqRef,{
                    utr, amount:amt, uid, name:window.db.user_name||'User',
                    status:'pending', createdAt:now
                });
            });
        } catch(e){
            if(btn) btn.disabled=false;
            return window.ui.toast(e.message||window.msg.deposit.submitFailed());
        }
        // Pending transaction record
        let trxDocId=null;
        try {
            if(!resumed){
                const trxRef=await addDoc(collection(dbService,"users",uid,"transactions"),{
                    title:window.msg.deposit.title.pending(amt),
                    amount:`+₹${amt}`, type:"deposit", status:"pending", trxId:utr, method:"UPI",
                    date:new Date().toLocaleDateString(), createdAt:now, timestamp:serverTimestamp()
                });
                trxDocId=trxRef.id;
                await updateDoc(reqRef,{trxDocId});
            }
        } catch(_){}
        if(btn) btn.disabled=false;
        // Close deposit modal, clear inputs
        try { document.getElementById('dep-amount').value=''; document.getElementById('dep-utr').value=''; } catch(_){}
        window.ui.closeModal();
        // Start verify with foreground overlay
        window.app.startDepositPoll(utr, amt, uid, {overlay:true});
    },
    // Single atomic check: returns {status: 'success'|'mismatch'|'notfound', received?}
    _checkFampay: async (utr, amt, uid) => {
        const reqRef=doc(dbService,"deposit_requests",utr);
        const fampayRef=doc(dbService,"fampay_deposits",utr);
        return await runTransaction(dbService, async (tx)=>{
            const reqSnap=await tx.get(reqRef);
            if(!reqSnap.exists()) return {status:'gone'};
            const r=reqSnap.data();
            if(r.status!=='pending' && r.status!=='processing') return {status:r.status, trxDocId:r.trxDocId, amount:r.receivedAmount||r.amount};
            const fSnap=await tx.get(fampayRef);
            if(!fSnap.exists()) return {status:'notfound', trxDocId:r.trxDocId};
            const f=fSnap.data();
            const fAmt=parseFloat(f.amount);
            if(isNaN(fAmt) || Math.abs(fAmt - parseFloat(r.amount)) > 0.01){
                return {status:'notfound', trxDocId:r.trxDocId, received:fAmt};
            }
            const userRef=doc(dbService,"users",uid);
            const userSnap=await tx.get(userRef);
            if(!userSnap.exists()) throw new Error("User missing");
            tx.update(userRef,{ depositBalance: increment(fAmt), totalDeposited: increment(fAmt), lastDepositUtr: utr });
            tx.update(reqRef,{status:'success', verifiedAt:Date.now(), receivedAmount:fAmt, claimed:true});
            tx.delete(fampayRef);
            return {status:'success', amount:fAmt, trxDocId:r.trxDocId};
        });
    },
    _depositNotify: async (uid, title, body) => {
        try {
            await addDoc(collection(dbService,"users",uid,"notifications"),{
                title, body, message:body, type:'deposit', read:false, date:new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}), createdAt:Date.now(), timestamp:serverTimestamp()
            });
        } catch(_){}
    },
    startDepositPoll: (utr, amt, uid, opts) => {
        opts=opts||{};
        if(window.app._activeDepositPolls[utr]) {
            if(opts.overlay) window.app._showVerifyOverlay(window.msg.deposit.alreadyChecking.title,window.msg.deposit.alreadyChecking.sub,'loading');
            return;
        }
        window.app._activeDepositPolls[utr] = true;
        const reqRef=doc(dbService,"deposit_requests",utr);

        const onSuccess=async (received, trxDocId)=>{
            if(trxDocId){
                try { await updateDoc(doc(dbService,"users",uid,"transactions",trxDocId),{ status:'success', title:window.msg.deposit.title.success(received) }); } catch(_){}
            }
            { const n=window.msg.deposit.successNotify(received,utr); await window.app._depositNotify(uid,n.title,n.body); }
            try { await window.app.fetchUserData(); } catch(_){}
            try { await window.app.fetchTransactions(); } catch(_){}
            if(opts.overlay){ const m=window.msg.deposit.success(received); window.app._showVerifyOverlay(m.title,m.sub,'success'); }
        };

        const onFail=async (trxDocId)=>{
            const F=window.msg.deposit.fail(amt, utr, lastSeen);
            try { await updateDoc(reqRef,{status:'failed', failedAt:Date.now()}); } catch(_){}
            if(trxDocId){
                try { await updateDoc(doc(dbService,"users",uid,"transactions",trxDocId),{ status:'failed', title:window.msg.deposit.title.failed(amt) }); } catch(_){}
            }
            await window.app._depositNotify(uid,F.title,F.body);
            try { await window.app.fetchTransactions(); } catch(_){}
            if(opts.overlay) window.app._showVerifyOverlay(F.title,F.sub,'fail');
            else window.ui.toast(F.toast);
        };

        const finish=()=>{ delete window.app._activeDepositPolls[utr]; };
        let lastSeen=null; // last bank-check result (used to explain WHY a deposit failed)

        // FOREGROUND phase: 10s window, polls at 1,3,5,7,9s (5 checks)
        const runForeground = async () => {
            window.app._showVerifyOverlay(window.msg.deposit.verifying.title,window.msg.deposit.verifying.sub,'loading');
            const timer=document.getElementById('dvo-timer');
            let remaining=10;
            const tick=setInterval(()=>{ remaining--; if(timer && remaining>=0) timer.innerText='Checking... '+remaining+'s'; }, 1000);
            const delays=[1000,2000,2000,2000,2000]; // total ~9s
            for(const wait of delays){
                await new Promise(r=>setTimeout(r,wait));
                try {
                    const res=await window.app._checkFampay(utr, amt, uid); lastSeen=res;
                    if(res.status==='success'){ clearInterval(tick); await onSuccess(res.amount, res.trxDocId); finish(); return; }
                    if(res.status==='gone' || res.status==='failed'){ clearInterval(tick); window.app._hideVerifyOverlay(); finish(); return; }
                } catch(_){}
            }
            clearInterval(tick);
            // Not matched in 10s → switch to processing background
            try { await updateDoc(reqRef,{status:'processing'}); } catch(_){}
            window.app._hideVerifyOverlay();
            window.ui.toast(window.msg.deposit.processingToast());
            runBackground();
        };

        const runBackground = async () => {
            let attempts=0;
            const maxAttempts=5;
            let trxDocId=null;
            try { const s=await getDoc(reqRef); trxDocId=s.exists()?s.data().trxDocId:null; } catch(_){}
            const iv=setInterval(async ()=>{
                attempts++;
                try {
                    const res=await window.app._checkFampay(utr, amt, uid); lastSeen=res;
                    if(res.status==='success'){ clearInterval(iv); await onSuccess(res.amount, res.trxDocId); finish(); return; }
                    if(res.status==='gone' || res.status==='failed'){ clearInterval(iv); finish(); return; }
                } catch(_){}
                if(attempts>=maxAttempts){
                    clearInterval(iv);
                    await onFail(trxDocId);
                    finish();
                }
            }, 10000);
        };

        if(opts.overlay) runForeground();
        else runBackground();
    },
});
