/**
 * Wallet history modal (withdrawal / deposit tabs).
 */
Object.assign(window.app, {
    // ===== WALLET HISTORY (Point 3) =====
    whTab: 'withdraw',
    openWalletHistory: () => { window.app.whTab='withdraw'; window.ui.openModal('modal-wallet-history'); window.app.renderWH(); },
    switchWHTab: (t,el) => {
        window.app.whTab=t;
        document.getElementById('wh-tab-withdraw').classList.toggle('active', t==='withdraw');
        document.getElementById('wh-tab-deposit').classList.toggle('active', t==='deposit');
        window.app.renderWH();
    },
    renderWH: () => {
        const c=document.getElementById('wh-list'); const cutoff=Date.now()-7*24*60*60*1000;
        const data=window.db.trx.filter(t=>t.type===window.app.whTab && (!t._ms||t._ms>=cutoff));
        if(!data.length){ c.innerHTML="<div style='text-align:center; padding:30px; color:#aaa'>No "+window.app.whTab+" records in the last 7 days.</div>"; return; }
        c.innerHTML="";
        data.forEach(t=>{ c.innerHTML+=window.app.trxRow(t); });
    },
});
