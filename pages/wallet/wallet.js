/**
 * Wallet page: balance card + transactions.
 */
import { collection, getDocs, doc, query, where, deleteDoc, dbService } from '../../js/core/firebase.js';

Object.assign(window.app, {
    renderWallet: () => {
        const _dep=parseFloat(window.db.depositBalance||0);
        const _wd=parseFloat(window.db.withdrawBalance||0);
        const _tot=_dep+_wd;
        window.db.balance=_tot;
        document.getElementById('wallet-balance').innerText=_tot.toFixed(2);
        document.getElementById('header-coins').innerText=Math.floor(_tot);
        const dEl=document.getElementById('wallet-deposit-bal'); if(dEl) dEl.innerText=_dep.toFixed(2);
        const wEl=document.getElementById('wallet-withdraw-bal'); if(wEl) wEl.innerText=_wd.toFixed(2);
        const tdEl=document.getElementById('wallet-total-deposit'); if(tdEl) tdEl.innerText=parseFloat(window.db.user_data.totalDeposited||0).toFixed(0);
        const twEl=document.getElementById('wallet-total-withdraw'); if(twEl) twEl.innerText=parseFloat(window.db.user_data.totalWithdrawn||0).toFixed(0);
        const c=document.getElementById('trx-list'); c.innerHTML="";
        if(window.db.trx.length===0){ c.innerHTML="<div style='text-align:center; padding:10px; color:#aaa'>No transactions yet. Add money or play a match to get started.</div>"; return; }
       // Only show deposits & withdrawals from last 7 days (Point 2)
        const cutoff = Date.now() - 7*24*60*60*1000;
        const filtered = window.db.trx.filter(t => (t.type==='deposit'||t.type==='withdraw'||t.type==='refund') && (!t._ms || t._ms>=cutoff));
        if(filtered.length===0){ c.innerHTML="<div style='text-align:center; padding:10px; color:#aaa'>No deposits, withdrawals or refunds in the last 7 days. Your recent activity will appear here.</div>"; return; }
        filtered.forEach(t=>{ c.innerHTML+=window.app.trxRow(t); });
    },
    fetchTransactions: async () => {
        try {
            const q=collection(dbService,"users",window.db.user_uid,"transactions");
            const snap=await getDocs(q); window.db.trx=[];
            const cutoff = Date.now() - 7*24*60*60*1000;
            const stale=[];
            snap.forEach(d=>{
                const dt=d.data();
                const ms = dt.timestamp&&dt.timestamp.seconds ? dt.timestamp.seconds*1000 : (dt.createdAt||Date.parse(dt.date)||0);
                dt._ms = ms; dt._id = d.id;
                if((dt.type==='deposit'||dt.type==='withdraw') && ms && ms<cutoff) stale.push(d.id);
                window.db.trx.push(dt);
            });
            window.db.trx.sort((a,b)=>(b._ms||0)-(a._ms||0));
            // Auto-remove deposit/withdraw records older than 7 days (Point 3)
            for(const sid of stale){ try{ await deleteDoc(doc(dbService,"users",window.db.user_uid,"transactions",sid)); }catch(e){} }
            // Resume any pending/processing UPI auto-deposit verifications (background only)
            try {
                const statuses=['pending','processing'];
                for(const st of statuses){
                    const rq=query(collection(dbService,"deposit_requests"), where("uid","==",window.db.user_uid), where("status","==",st));
                    const rsnap=await getDocs(rq);
                    rsnap.forEach(d=>{
                        const r=d.data();
                        if(!window.app._activeDepositPolls[r.utr]){
                            window.app.startDepositPoll(r.utr, parseFloat(r.amount), window.db.user_uid, {overlay:false});
                        }
                    });
                }
            } catch(_){}
        } catch(e){}
    },
});
