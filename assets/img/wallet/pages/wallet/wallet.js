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
        const _wf=window.walletfx;
        _wf.tween(document.getElementById('wallet-balance'),_tot,2);
        _wf.tween(document.getElementById('header-coins'),Math.floor(_tot),0,700);
        const dEl=document.getElementById('wallet-deposit-bal'); if(dEl) _wf.tween(dEl,_dep,2);
        const wEl=document.getElementById('wallet-withdraw-bal'); if(wEl) _wf.tween(wEl,_wd,2);
        const tdEl=document.getElementById('wallet-total-deposit'); if(tdEl) tdEl.innerText=parseFloat(window.db.user_data.totalDeposited||0).toFixed(0);
        const twEl=document.getElementById('wallet-total-withdraw'); if(twEl) twEl.innerText=parseFloat(window.db.user_data.totalWithdrawn||0).toFixed(0);
        const c=document.getElementById('trx-list'); c.innerHTML="";
        if(window.db.trx.length===0){ c.innerHTML="<div style='text-align:center; padding:10px; color:#aaa'>No transactions yet. Add money or play a match to get started.</div>"; return; }
       // Only show deposits & withdrawals from last 7 days (Point 2)
        const cutoff = Date.now() - 7*24*60*60*1000;
        const filtered = window.trxSort(window.db.trx.filter(t => (t.type==='deposit'||t.type==='withdraw'||t.type==='refund'||t.kind==='game_win'||t.kind==='game_entry'||t.kind==='game_refund'||t.kind==='gift'||t.kind==='prize'||t.kind==='admin_add'||t.kind==='admin_cut') && (!t._ms || t._ms>=cutoff)));
        if(filtered.length===0){ c.innerHTML="<div class='empty-art'><img src='"+window.gameArt.empty('matches')+"' alt='' draggable='false'><b>No activity yet</b><span>Deposits, withdrawals, gift codes and game wins from the last 7 days appear here.</span></div>"; return; }
        // anything that arrived since the last paint is flashed + slides in at the very top
        const seen = window.app._seenTrx || (window.app._seenTrx = null);
        window.app._newTrx = new Set(seen ? filtered.filter(t => !seen.has(t._id)).map(t => t._id) : []);
        window.app._seenTrx = new Set(filtered.map(t => t._id));
        c.innerHTML = filtered.map(t => window.app.trxRow(t)).join('');
    },
    fetchTransactions: async () => {
        try {
            const q=collection(dbService,"users",window.db.user_uid,"transactions");
            const snap=await getDocs(q); window.db.trx=[];
            const cutoff = Date.now() - 7*24*60*60*1000;
            const stale=[];
            snap.forEach(d=>{
                const dt=d.data();
                const ms = window.trxMs(dt);
                dt._ms = ms; dt._id = d.id;
                if((dt.type==='deposit'||dt.type==='withdraw') && ms && ms<cutoff) stale.push(d.id);
                window.db.trx.push(dt);
            });
            window.db.trx = window.trxSort(window.db.trx);
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
