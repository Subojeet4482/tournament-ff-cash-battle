/**
 * Leaderboard: Daily / Weekly / Monthly. Ranked by match WINNINGS in that period (withdrawal-balance earnings),
 * not by total wallet. Players with 0 winnings are not listed.
 * Data: lb/{d|w|m}-{key}.players = { uid: { n: name, a: amount } }  (written by the admin panel when prizes are credited)
 */
import { doc, getDoc, onSnapshot, dbService } from '../../js/core/firebase.js';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
export const lbKey = (p, d) => {
    d = d || new Date();
    if (p === 'd') return 'd-' + ymd(d);
    if (p === 'w') { const m = new Date(d); const k = (m.getDay() + 6) % 7; m.setDate(m.getDate() - k); return 'w-' + ymd(m); }   // week starts Monday
    return 'm-' + d.getFullYear() + pad(d.getMonth() + 1);
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const coin = (v) => window.app.coinHtml(Number(v || 0).toFixed(2));
const LBL = { d: 'Today', w: 'This week', m: 'This month' };
let period = 'd', unsub = null, cfg = null;

Object.assign(window.app, {
    setLBPeriod: (p) => {
        period = p;
        document.querySelectorAll('.lb-tab').forEach(b => b.classList.toggle('on', b.dataset.p === p));
        const seg = document.getElementById('lb-seg'); if (seg) seg.dataset.active = p;
        window.app.fetchLeaderboard();
    },
    fetchLeaderboard: async () => {
        try {
            if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
            const list = document.getElementById('lb-list');
            if (list && !(window.db.leaderboard || []).length) list.innerHTML = '<div class="lb-skel"></div><div class="lb-skel"></div><div class="lb-skel"></div>';
            unsub = onSnapshot(doc(dbService, 'lb', lbKey(period)), (s) => {
                const pl = (s.exists() && s.data().players) || {}, me = window.db.user_uid;
                const arr = Object.keys(pl).map(id => ({ id, name: pl[id].n || 'User', score: Number(pl[id].a) || 0, isVerified: !!pl[id].v,
                    img: pl[id].p || `https://ui-avatars.com/api/?name=${encodeURIComponent(pl[id].n || 'User')}`, isMe: id === me }))
                    .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 50);
                window.db.leaderboard = arr;
                window.app.renderLB();
            }, (e) => { console.error('LB live error', e); window.db.leaderboard = []; window.app.renderLB(); });
            window.app.renderLBReward();
        } catch (e) { console.error('LB fetch error', e); }
    },
    renderLBReward: async () => {
        const box = document.getElementById('lb-reward'); if (!box) return;
        if (period !== 'm') { box.style.display = 'none'; return; }
        try { if (!cfg) { const s = await getDoc(doc(dbService, 'config', 'leaderboard')); cfg = s.exists() ? s.data() : {}; } } catch (e) { cfg = {}; }
        const rw = (cfg.rewards || []).filter(r => Number(r.amount) > 0);
        if (!rw.length) { box.style.display = 'none'; return; }
        const now = new Date(), end = new Date(now.getFullYear(), now.getMonth() + 1, 1), left = end - now;
        const d = Math.floor(left / 86400000), h = Math.floor((left % 86400000) / 3600000);
        const med = ['🥇', '🥈', '🥉'];
        box.style.display = 'block';
        box.innerHTML = `<div class="lbr-top"><i class="fa-solid fa-gift"></i><b>Monthly Rewards</b><span>ends in ${d}d ${h}h</span></div>
            <div class="lbr-row">${rw.map((r, i) => `<div class="lbr-chip" style="animation-delay:${i * 80}ms"><span>${med[i] || '#' + (i + 1)}</span>${window.app.coinHtml(r.amount)}</div>`).join('')}</div>
            <small>Paid to your wallet &amp; notification bell at 12:00 AM on the 1st.</small>`;
    },
    renderLB: () => {
        const podium = document.getElementById('lb-podium'), list = document.getElementById('lb-list'); podium.innerHTML = ''; list.innerHTML = '';
        const data = window.db.leaderboard || [];
        if (!data.length) { list.innerHTML = `<div class="lb-empty"><i class="fa-solid fa-trophy"></i><b>No winners yet — ${LBL[period].toLowerCase()}</b><span>Win a match to appear here!</span></div>`; return; }
        const top3 = data.slice(0, 3), order = [];
        if (top3[1]) order.push({ p: top3[1], r: 2 }); if (top3[0]) order.push({ p: top3[0], r: 1 }); if (top3[2]) order.push({ p: top3[2], r: 3 });
        const tickOf = (p, sz) => p.isVerified ? ` <i class="fa-solid fa-circle-check" style="color:#1d9bf0;font-size:${sz};"></i>` : '';
        order.forEach(({ p, r }, i) => {
            podium.innerHTML += `<div class="podium-item podium-${r}" style="animation:lbRise .55s ${i * 110}ms cubic-bezier(.34,1.3,.64,1) backwards"><div class="crown" style="${r === 1 ? '' : 'display:none'}"><i class="fa-solid fa-crown"></i></div><div class="p-img-box"><img src="${esc(p.img)}"><div class="p-rank-badge">${r}</div></div><div style="font-weight:700; margin-top:10px; font-size:0.9rem;">${esc(p.name)}${tickOf(p, '0.75rem')}</div><div class="text-primary bold">${coin(p.score)}</div></div>`;
        });
        data.slice(3).forEach((p, i) => {
            list.innerHTML += `<div class="rank-item" style="animation:lbSlide .4s ${Math.min(i, 10) * 45}ms ease both;${p.isMe ? 'border:1px solid var(--primary); background:#eef2ff' : ''}"><div class="r-pos">${i + 4}</div><img src="${esc(p.img)}" class="r-img"><div style="flex:1"><div style="font-weight:600">${esc(p.name)}${tickOf(p, '0.78rem')} ${p.isMe ? '(You)' : ''}</div><div style="font-size:0.75rem; color:#aaa">${LBL[period]} winnings</div></div><div class="r-val">${coin(p.score)}</div></div>`;
        });
    },
});
