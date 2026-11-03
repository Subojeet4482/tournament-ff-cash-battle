/**
 * Transaction rows + detail sheet.
 * Every wallet/history row is tappable and opens a sheet with an easy English explanation,
 * the reason (for failed / rejected / refunded) and what to do next. Texts come from js/core/messages.js.
 */
// Order number — same formula as the admin panel (so both sides see the same number)
const orderOf = (t) => {
    if (t.orderNo) return t.orderNo;
    const title = String(t.title || ''), type = String(t.type || ''), k = t.kind;
    let p = type === 'withdraw' ? 'WD' : 'DP';
    if (k === 'admin_add' || /^(System .* add|Admin credit|🎁)/i.test(title)) p = 'AD';
    else if (k === 'admin_cut' || /^(System .* cut|Admin deduct)/i.test(title)) p = 'AC';
    else if (k === 'prize' || /^Match win/i.test(title)) p = 'PZ';
    else if (k === 'refund' || type === 'refund') p = 'RF';
    else if (k === 'gift') p = 'GF';
    else if (type === 'game') p = 'GM';
    const ms = t.createdAt || t._ms || Date.now(), d = new Date(ms);
    const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    return `${p}-${ymd}-${String(t._id || 'XXXXXX').slice(-(p === 'DP' || p === 'WD' ? 4 : 6)).toUpperCase()}`;
};
Object.assign(window.app, {
    orderNo: orderOf,
    // One row, used by the Wallet page and the History modal
    trxRow: (t) => {
        const D = window.msg.describe(t);
        const type = String(t.type || '').toLowerCase(), kind = String(t.kind || ''), title = String(t.title || '');
        // PNG artwork per kind of transaction (wallet_icons)
        let ic = 'coin';
        if (kind === 'gift' || /gift/i.test(title)) ic = 'gift_code';
        else if (kind === 'admin_cut' || /^(System .* cut|Admin deduct)/i.test(title)) ic = 'admin_cut';
        else if (kind === 'admin_add' || /^(System .* add|Admin credit)/i.test(title)) ic = 'admin_add';
        else if (type === 'withdraw') ic = 'withdraw';
        else if (type === 'deposit' || type === 'refund') ic = 'deposit';
        const src = ic === 'coin' ? 'assets/img/ff-coin.png' : `assets/img/wallet/${ic}.png`;
        const raw = String(t.amount == null ? '' : t.amount).trim();
        const amt = raw.includes('₹') ? raw : '₹' + raw;
        const neg = /^[-−]/.test(raw) || ic === 'admin_cut' || (type === 'withdraw' && !/^\+/.test(raw)) || (type === 'game' && !/^\+/.test(raw) && kind !== 'game_win');
        const tone = D.status === 'failed' || D.status === 'rejected' || D.status === 'cancelled' ? 'muted' : neg ? 'down' : (ic === 'gift_code' ? 'gift' : 'up');
        const esc = (x) => String(x == null ? '' : x).replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c]));
        const note = D.short ? `<p class="trx-note tone-${D.tone}">${D.tone === 'success' ? '<i class="fa-solid fa-check"></i> ' : ''}${esc(D.short)}</p>` : '';
        const fresh = window.app._newTrx && window.app._newTrx.has(t._id) ? ' tx-new' : '';
        return `<div class="trx-item tx-${tone}${fresh}" onclick="app.openTrx('${esc(t._id || '')}')"><img class="tx-ic" src="${src}" alt="" draggable="false" loading="lazy"><div class="tx-main"><h4>${esc(t.title)}</h4><p class="tx-date">${esc(t.date)}</p>${note}</div><div class="tx-side"><div class="tx-amt">${esc(amt)}</div><span class="trx-status status-${D.status} tx-chip">${D.label}</span></div></div>`;
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
        if (t.method) rows.push(['Method', t.method === 'BANK' ? 'Bank transfer' : t.method === 'CRYPTO' ? 'Crypto' : t.method === 'UPI' && type === 'withdraw' ? 'UPI' : t.method]);
        if (type === 'withdraw' && t.net) rows.push(['You receive', t.net]);
        if (t.upiId) rows.push(['UPI ID', mask(t.upiId)]);
        if (t.accountNumber) rows.push(['Account', mask(t.accountNumber)]);
        if (t.walletAddress) rows.push(['Wallet', mask(t.walletAddress)]);
        if (t.coin) rows.push(['Coin / Network', t.coin + (t.network ? ' · ' + t.network : '')]);
        if (t.trxId) rows.push([t.method === 'CRYPTO' ? 'Transaction hash' : 'UTR / Txn ID', t.trxId]);
        rows.push(['Order No', orderOf(t)]);
        if (t.note) rows.push(['Note', t.note]);
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
