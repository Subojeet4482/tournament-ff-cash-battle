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
        if(!data.length){ c.innerHTML="<div style='text-align:center; padding:30px; color:#aaa'>No "+window.app.whTab+" records in last 7 days</div>"; return; }
        c.innerHTML="";
        data.forEach(t=>{
            const col = t.type==='deposit' ? 'var(--success)' : 'var(--danger)';
            const ic = t.type==='deposit' ? 'fa-arrow-down' : 'fa-arrow-up';
            const box = t.type==='deposit' ? 'icon-deposit' : 'icon-withdraw';
            c.innerHTML+=`<div class="trx-item"><div style="display:flex; align-items:center;"><div class="trx-icon-box ${box}"><i class="fa-solid ${ic}"></i></div><div><h4>${t.title}</h4><p class="text-muted" style="font-size:0.75rem">${t.date}</p></div></div><div style="text-align:right"><div style="font-weight:700; color:${col}">₹${t.amount}</div><span class="trx-status status-${t.status}">${t.status}</span></div></div>`;
        });
    },
});
