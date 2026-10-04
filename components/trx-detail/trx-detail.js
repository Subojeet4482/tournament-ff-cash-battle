/**
 * Transaction rows + detail sheet.
 * Every wallet/history row is tappable and opens a sheet with an easy English explanation,
 * the reason (for failed / rejected / refunded) and what to do next. Texts come from js/core/messages.js.
 */
Object.assign(window.app, {
    // One row, used by the Wallet page and the History modal
    trxRow: (t) => {
        const D = window.msg.describe(t);
        const type = String(t.type || '').toLowerCase();
        const refund = type === 'refund' || D.status === 'refunded';
        let icon = 'fa-gamepad', box = 'icon-game', col = 'var(--text-main)';
        if (type === 'deposit')  { icon = 'fa-arrow-down'; box = 'icon-deposit';  col = 'var(--success)'; }
        if (type === 'withdraw') { icon = 'fa-arrow-up';   box = 'icon-withdraw'; col = 'var(--danger)'; }
        if (type === 'refund')   { icon = 'fa-rotate-left'; box = 'icon-refund';  col = 'var(--primary)'; }
        if (D.status === 'failed' || D.status === 'rejected' || D.status === 'cancelled') col = 'var(--text-muted)';
        const raw = String(t.amount == null ? '' : t.amount);
        const amt = raw.includes('₹') ? raw : '₹' + raw;
        const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const note = D.short ? `<p class="trx-note tone-${D.tone}">${esc(D.short)}</p>` : '';
        return `<div class="trx-item" onclick="app.openTrx('${esc(t._id || '')}')" style="cursor:pointer;"><div style="display:flex; align-items:center; min-width:0;"><div class="trx-icon-box ${box}"><i class="fa-solid ${icon}"></i></div><div style="min-width:0;"><h4>${esc(t.title)}</h4><p class="text-muted" style="font-size:0.75rem">${esc(t.date)}</p>${note}</div></div><div style="text-align:right; flex:none; margin-left:8px;"><div style="font-weight:700; color:${col}">${esc(amt)}</div><span class="trx-status status-${D.status}">${D.label}</span></div></div>`;
    },

    openTrx: (id) => {
        const t = (window.db.trx || []).find(x => x._id === id);
        if (!t) return;
        const D = window.msg.describe(t), M = window.msg;
        const $ = (i) => document.getElementById(i);
        const raw = String(t.amount == null ? '' : t.amount);
        $('td-amount').innerText = raw.includes('₹') ? raw : '₹' + raw;
        const icon = $('td-icon'); icon.className = 'td-icon tone-' + D.tone;
        icon.innerHTML = `<i class="fa-solid ${D.icon}${D.status === 'processing' ? ' fa-spin' : ''}"></i>`;
        const chip = $('td-chip'); chip.className = 'trx-status status-' + D.status; chip.innerText = D.label;
        $('td-headline').innerText = D.headline;
        $('td-message').innerText = D.message;
        const rs = $('td-reason');
        if (D.reason) { rs.style.display = 'block'; $('td-reason-title').innerText = D.reason.label; $('td-reason-text').innerText = D.reason.text; }
        else rs.style.display = 'none';
        const nx = $('td-next');
        if (D.next && D.next.length) { nx.style.display = 'block'; $('td-next-list').innerHTML = D.next.map(n => `<li></li>`).join(''); [...$('td-next-list').children].forEach((li, i) => li.innerText = D.next[i]); }
        else nx.style.display = 'none';

        // detail rows
        const mask = (v) => { v = String(v || ''); return v.length > 4 ? v.slice(0, 2) + '•'.repeat(Math.max(v.length - 4, 2)) + v.slice(-2) : v; };
        const rows = [];
        const type = String(t.type || '').toLowerCase();
        rows.push(['Type', type === 'withdraw' ? 'Withdrawal' : type === 'deposit' ? 'Deposit' : type === 'refund' ? 'Refund' : 'Match entry']);
        if (t.method) rows.push(['Method', t.method === 'BANK' ? 'Bank transfer' : t.method === 'CRYPTO' ? 'Crypto' : t.method]);
        if (type === 'withdraw' && t.net) rows.push(['You receive', t.net]);
        if (t.accountNumber) rows.push(['Account', mask(t.accountNumber)]);
        if (t.walletAddress) rows.push(['Wallet', mask(t.walletAddress)]);
        if (t.coin) rows.push(['Coin / Network', t.coin + (t.network ? ' · ' + t.network : '')]);
        if (t.trxId) rows.push([t.method === 'CRYPTO' ? 'Transaction hash' : 'UTR', t.trxId]);
        rows.push(['Date', t.date || '--']);
        const ref = M.refOf(t); if (ref) rows.push(['Reference ID', ref]);
        const box = $('td-rows'); box.innerHTML = '';
        rows.forEach(([k, v]) => {
            const r = document.createElement('div'); r.className = 'td-row';
            const a = document.createElement('span'); a.innerText = k;
            const b = document.createElement('b'); b.innerText = v;
            r.append(a, b); box.appendChild(r);
        });
        // support button only when something needs attention
        $('td-help').style.display = (['failed', 'rejected', 'cancelled'].includes(D.status) || D.status === 'pending' || D.status === 'processing') ? '' : 'none';

        // close any other open sheet first (this sheet sits on top, history is closed quietly)
        document.querySelectorAll('.modal-wrap.active').forEach(m => m.classList.remove('active'));
        window.ui.openModal('modal-trx-detail');
    },
});
