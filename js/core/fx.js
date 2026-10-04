/**
 * Small animation helpers shared by Join / Auth / Session.
 */
window.fx = {
    wait: (ms) => new Promise(r => setTimeout(r, ms)),

    // Number count-up (runs once per value — background refreshes don't replay it)
    countUp: (el, to, ms = 550) => {
        if(!el || el.dataset.val === String(to)) return;
        el.dataset.val = String(to);
        const dec = String(to).includes('.') ? 2 : 0, t0 = performance.now();
        const step = (t) => {
            const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
            el.textContent = (to * e).toFixed(dec);
            if(p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    },

    confetti: (box, n = 40) => {
        if(!box) return;
        box.innerHTML = '';
        const colors = ['#4f46e5','#f43f5e','#10b981','#f59e0b','#0ea5e9','#a855f7'];
        for(let i = 0; i < n; i++){
            const s = document.createElement('i');
            s.style.setProperty('--dx', (Math.random() * 320 - 160).toFixed(0) + 'px');
            s.style.setProperty('--dy', (-(Math.random() * 200 + 70)).toFixed(0) + 'px');
            s.style.setProperty('--rot', (Math.random() * 720 - 360).toFixed(0) + 'deg');
            s.style.background = colors[i % colors.length];
            s.style.animationDelay = (Math.random() * 0.18).toFixed(2) + 's';
            if(i % 3 === 0) s.style.borderRadius = '50%';
            box.appendChild(s);
        }
    },

    // Success overlay inside the join sheet
    joinDone: async (title, sub, opts = {}) => {
        const el = document.getElementById('join-done'); if(!el) return;
        document.getElementById('jd-title').innerText = title;
        document.getElementById('jd-sub').innerText = sub || '';
        el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
        if(opts.confetti) window.fx.confetti(document.getElementById('jd-confetti'));
        await window.fx.wait(opts.hold || 800);
        if(!opts.keep) window.fx.joinDoneHide();
    },
    joinDoneHide: () => {
        const el = document.getElementById('join-done');
        if(el) el.classList.remove('show');
        const c = document.getElementById('jd-confetti'); if(c) c.innerHTML = '';
    },
};
