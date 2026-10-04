/**
 * My Matches page — Join Match (room ID / password) + History (result, kills, prize, fee, room, players).
 * All data comes from the match document + participants[]; the admin enters the result (kills, winAmount, winnerUid).
 */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => { n = Number(n) || 0; return '₹' + (Number.isInteger(n) ? n : n.toFixed(2)); };
const startMs = (m) => m.startTime ? (m.startTime.seconds ? m.startTime.seconds * 1000 : new Date(m.startTime).getTime()) : 0;
const dateLbl = (m) => {
    const ms = startMs(m);
    if (!ms || isNaN(ms)) return m.time || '';
    return new Date(ms).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const TYPE = { per_kill: 'Per Kill', team_win: 'Team Win' };

// A single match's result (used by both history and summary)
const resultOf = (m, myUid) => {
    const me = (m.participants || []).find(p => p.uid === myUid) || {};
    const fee = parseFloat(m.fee) || 0;
    const kills = Number(me.kills) || 0;
    const won = m.winnerUid === myUid;
    let amount;
    if (me.winAmount !== undefined && me.winAmount !== null) amount = Number(me.winAmount) || 0;
    else if (m.matchType === 'per_kill') amount = kills * (parseFloat(m.prize) || 0);
    else amount = won ? (parseFloat(m.prize) || 0) : 0;
    const kind = won ? 'win' : (kills > 0 || amount > 0) ? 'kill' : 'loss';
    return { me, fee, kills, won, amount, net: amount - fee, kind };
};

Object.assign(window.app, {
    copyCred: (btn, text) => {
        try { navigator.clipboard.writeText(text); } catch (e) {}
        btn.classList.remove('copied'); void btn.offsetWidth; btn.classList.add('copied');
        const lbl = btn.querySelector('.mx-copy-lbl'); const old = lbl ? lbl.dataset.o || lbl.innerText : '';
        if (lbl) { lbl.dataset.o = old; lbl.innerText = 'COPIED'; setTimeout(() => { lbl.innerText = old; btn.classList.remove('copied'); }, 1400); }
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
    },
    copyBoth: (btn, id, pass) => {
        window.app.copyCred(btn, 'Room ID: ' + id + '\nPassword: ' + pass);
    },

    _roomBox: (m, slot, done) => {
        if (m.roomId && m.roomPass) {
            const id = esc(m.roomId), pw = esc(m.roomPass);
            const idJs = esc(JSON.stringify(String(m.roomId))), pwJs = esc(JSON.stringify(String(m.roomPass)));
            return `<div class="mx-room ${done ? 'saved' : 'open'}">
                <div class="mx-room-head"><span class="mx-lock"><i class="fa-solid ${done ? 'fa-box-archive' : 'fa-lock-open'}"></i></span>
                    <div><b>${done ? 'Saved Room Credentials' : 'Room is Open — Join Now!'}</b><small>${done ? 'Room details of this match' : 'Free Fire → Custom Room → enter ID & password'}</small></div>
                    ${done ? '' : '<span class="mx-live"><i></i>LIVE</span>'}</div>
                <div class="mx-cred-row">
                    <button type="button" class="mx-cred" onclick="app.copyCred(this, ${idJs})"><span class="mx-cred-l">Room ID</span><span class="mx-cred-v">${id}</span><span class="mx-copy"><i class="fa-regular fa-copy"></i> <span class="mx-copy-lbl">COPY</span></span></button>
                    <button type="button" class="mx-cred" onclick="app.copyCred(this, ${pwJs})"><span class="mx-cred-l">Password</span><span class="mx-cred-v">${pw}</span><span class="mx-copy"><i class="fa-regular fa-copy"></i> <span class="mx-copy-lbl">COPY</span></span></button>
                </div>
                <button type="button" class="mx-copy-all" onclick="app.copyBoth(this, ${idJs}, ${pwJs})"><i class="fa-solid fa-clone"></i> <span class="mx-copy-lbl">COPY ID &amp; PASSWORD</span></button>
            </div>`;
        }
        if (done) return `<div class="mx-room locked"><div class="mx-room-head"><span class="mx-lock"><i class="fa-solid fa-ban"></i></span><div><b>No room details saved</b><small>Room ID & password were not published for this match.</small></div></div></div>`;
        const ms = startMs(m);
        return `<div class="mx-room locked">
            <div class="mx-room-head"><span class="mx-lock pulse"><i class="fa-solid fa-lock"></i></span>
                <div><b>Room ID &amp; Password locked</b><small>They appear here 10 mins before the match. You'll get an alert.</small></div></div>
            ${ms ? `<div class="mx-count"><span>Starts in</span><b class="countdown-timer" data-target="${ms}">--</b></div>` : ''}
            <div class="mx-skel"><i></i><i></i></div>
        </div>`;
    },

    _historySummary: (list, myUid) => {
        let won = 0, kills = 0, spent = 0, earned = 0;
        list.forEach(m => { const r = resultOf(m, myUid); spent += r.fee; earned += r.amount; kills += r.kills; if (r.won) won++; });
        const net = earned - spent;
        const cell = (ico, val, lbl, cls) => `<div class="mx-sum-c ${cls || ''}"><i class="fa-solid ${ico}"></i><b data-cu="${val}">${val}</b><span>${lbl}</span></div>`;
        return `<div class="mx-sum">
            <div class="mx-sum-top"><div><small>NET RESULT</small><div class="mx-net ${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : '-'}${money(Math.abs(net))}</div></div><div class="mx-sum-ico"><i class="fa-solid fa-chart-line"></i></div></div>
            <div class="mx-sum-grid">
                ${cell('fa-gamepad', list.length, 'Played')}
                ${cell('fa-trophy', won, 'Wins', 'gold')}
                ${cell('fa-crosshairs', kills, 'Kills')}
                ${cell('fa-indian-rupee-sign', Math.round(earned * 100) / 100, 'Won', 'green')}
                ${cell('fa-wallet', Math.round(spent * 100) / 100, 'Spent', 'red')}
            </div></div>`;
    },

    _historyCard: (m, myUid, idx) => {
        const img = esc(m.img || 'https://placehold.co/100x100/1e293b/FFF?text=Game');
        const R = resultOf(m, myUid), me = R.me;
        const slot = me.slot || (me.slots && me.slots[0]) || '-';
        const perKill = m.matchType === 'per_kill';
        const cls = R.kind;
        const chip = R.kind === 'win' ? '<i class="fa-solid fa-trophy"></i> WON' : R.kind === 'kill' ? '<i class="fa-solid fa-crosshairs"></i> ' + R.kills + ' KILL' + (R.kills > 1 ? 'S' : '') : '<i class="fa-solid fa-flag-checkered"></i> PLAYED';
        let banner;
        if (R.kind === 'win') banner = `<div class="mx-banner win"><div class="mx-bn-ico"><i class="fa-solid fa-trophy"></i></div><div class="mx-bn-t"><small>CHAMPION · WINNER WINNER</small><b>${esc(m.winnerName || me.appName || window.db.user_name || 'You')}</b></div><div class="mx-bn-amt">+${money(R.amount)}</div></div>`;
        else if (R.kind === 'kill') banner = `<div class="mx-banner kill"><div class="mx-bn-ico"><i class="fa-solid fa-crosshairs"></i></div><div class="mx-bn-t"><small>${perKill ? 'KILL REWARD' : 'GOOD FIGHT'}</small><b>${R.kills} Kill${R.kills > 1 ? 's' : ''}${perKill ? ' × ' + money(m.prize) : ''}</b></div><div class="mx-bn-amt">${R.amount > 0 ? '+' + money(R.amount) : '₹0'}</div></div>`;
        else banner = `<div class="mx-banner loss"><div class="mx-bn-ico"><i class="fa-solid fa-face-sad-tear"></i></div><div class="mx-bn-t"><small>NO KILLS · NO WIN</small><b>Better luck next time</b></div><div class="mx-bn-amt">₹0</div></div>`;
        const netCls = R.net > 0 ? 'pos' : R.net < 0 ? 'neg' : '';
        const joined = Number(m.joined) || (m.participants || []).length, total = Number(m.total) || 48;
        return `<div class="mm-card mx-card mx-h ${cls}" style="--i:${idx}">
            <div class="mx-top"><img src="${img}" class="mx-thumb" alt=""><div class="mx-title"><h4>${esc(m.title)}</h4><small><i class="fa-regular fa-calendar"></i> ${esc(dateLbl(m))}</small></div><span class="mx-chip ${cls}">${chip}</span></div>
            ${banner}
            <div class="mx-money">
                <div><small>Entry Paid</small><b class="neg">-${money(R.fee)}</b></div>
                <div><small>Won</small><b class="pos">+${money(R.amount)}</b></div>
                <div><small>Net</small><b class="${netCls}">${R.net >= 0 ? '+' : '-'}${money(Math.abs(R.net))}</b></div>
            </div>
            <div class="mx-grid">
                <div><small>Slot</small><b>#${esc(slot)}</b></div>
                <div><small>Kills</small><b>${R.kills}</b></div>
                <div><small>Type</small><b>${TYPE[m.matchType] || 'Win Prize'}</b></div>
                <div><small>${perKill ? 'Per Kill' : 'Prize Pool'}</small><b>${money(m.prize)}</b></div>
                <div><small>Players</small><b>${joined}/${total}</b></div>
                <div><small>Map</small><b>${esc(m.map || 'Bermuda')}</b></div>
            </div>
            <div class="mx-ff"><div><small>FF Name</small><b>${esc(me.gameName || '-')}</b></div><div><small>FF UID</small><b>${esc(me.gameUid || '-')}</b></div></div>
            ${window.app._roomBox(m, slot, true)}
        </div>`;
    },

    _upcomingCard: (m, myUid, idx) => {
        const img = esc(m.img || 'https://placehold.co/100x100/1e293b/FFF?text=Game');
        const me = (m.participants || []).find(p => p.uid === myUid) || {};
        const slot = me.slot || (me.slots && me.slots[0]) || null;
        const perKill = m.matchType === 'per_kill';
        const joined = Number(m.joined) || (m.participants || []).length, total = Number(m.total) || 48;
        const pct = Math.min(100, Math.round(joined / total * 100));
        const ready = !!(m.roomId && m.roomPass);
        return `<div class="mm-card mx-card mx-u ${ready ? 'ready' : ''}" style="--i:${idx}">
            <div class="mx-top"><img src="${img}" class="mx-thumb" alt=""><div class="mx-title"><h4>${esc(m.title)}</h4><small><i class="fa-regular fa-calendar"></i> ${esc(dateLbl(m) || 'Upcoming')}</small></div><span class="mx-chip joined"><i class="fa-solid fa-circle-check"></i> JOINED</span></div>
            <div class="mx-slotbar ${slot ? '' : 'warn'}"><i class="fa-solid ${slot ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i><span>${slot ? 'You are in — Slot <b>#' + esc(slot) + '</b>' : 'Slot not chosen yet — contact support if this stays'}</span></div>
            ${window.app._roomBox(m, slot, false)}
            <div class="mx-grid">
                <div><small>Entry Fee</small><b>${money(m.fee)}</b></div>
                <div><small>${perKill ? 'Per Kill' : 'Prize Pool'}</small><b>${money(m.prize)}</b></div>
                <div><small>Type</small><b>${TYPE[m.matchType] || 'Win Prize'}</b></div>
            </div>
            <div class="mx-players"><div class="mx-pl-t"><span><i class="fa-solid fa-users"></i> Players joined</span><b>${joined}/${total}</b></div><div class="mx-bar"><i style="--w:${pct}%"></i></div></div>
            <div class="mx-ff"><div><small>FF Name</small><b>${esc(me.gameName || '-')}</b></div><div><small>FF UID</small><b>${esc(me.gameUid || '-')}</b></div></div>
        </div>`;
    },

    renderMyMatches: () => {
        const c = document.getElementById('my-matches-list'); if (!c) return;
        const tab = window.app.activeTab || 'join';
        const myUid = window.db.user_uid;
        const mine = (window.db.matches || []).filter(m => (window.db.joined_ids || []).includes(m.id));
        const hist = mine.filter(m => m.status === 'completed').sort((a, b) => startMs(b) - startMs(a));
        const data = tab === 'history' ? hist : mine.filter(m => m.status !== 'completed');
        if (!data.length) {
            c.innerHTML = `<div class="mx-empty"><div class="mx-empty-ico"><i class="fa-solid ${tab === 'history' ? 'fa-clock-rotate-left' : 'fa-ghost'}"></i></div><b>${tab === 'history' ? 'No match history yet' : 'No joined matches'}</b><p>${tab === 'history' ? 'Finished matches with your kills, winnings and room details will be saved here.' : 'Join a match from Home — your Room ID & password will show up here.'}</p></div>`;
            return;
        }
        let html = tab === 'history' ? window.app._historySummary(hist, myUid) : '';
        html += data.map((m, i) => tab === 'history' ? window.app._historyCard(m, myUid, i) : window.app._upcomingCard(m, myUid, i)).join('');
        c.innerHTML = html;
        if (tab === 'history' && window.ui && window.ui.countUp) c.querySelectorAll('.mx-sum-c b').forEach(b => window.ui.countUp(b, 900));
        if (window.timers && window.timers.tick) window.timers.tick();
    },
    activeTab: 'join',
    switchTab: (t, e) => {
        window.app.activeTab = t;
        const wrap = document.querySelector('#page-matches .mm-tabs-wrapper'); if (wrap) wrap.dataset.active = t;
        document.querySelectorAll('#page-matches .mm-tab').forEach(x => x.classList.remove('active'));
        if (e) e.classList.add('active');
        window.app.renderMyMatches();
    },
});
