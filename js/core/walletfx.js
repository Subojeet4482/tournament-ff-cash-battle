/**
 * Wallet animations: number tween + 3-second deposit / withdrawal coin animation.
 * Uses the golden FF coin (assets/img/ff-coin.png) everywhere.
 */
(() => {
    const COIN = 'assets/img/ff-coin.png';
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const $ = (id) => document.getElementById(id);
    const fmt = (v, dec) => Number(v || 0).toFixed(dec);

    const W = {
        COIN,
        coinImg: (cls) => `<img class="${cls || 'coin-ico'}" src="${COIN}" alt="FF coin" draggable="false">`,

        // Smooth number change (never replays from 0 on first render)
        tween(el, to, dec = 2, ms = 900) {
            if (!el) return;
            const from = typeof el._cur === 'number' ? el._cur : null;
            el._cur = to;
            if (from === null || from === to || document.hidden) { el.innerText = fmt(to, dec); return; }
            cancelAnimationFrame(el._raf);
            el.dataset.cu = '1';   // tells polish.js not to bump on every frame
            const t0 = performance.now();
            const step = (t) => {
                const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
                el.innerText = fmt(from + (to - from) * e, dec);
                if (p < 1) el._raf = requestAnimationFrame(step); else { el.innerText = fmt(to, dec); delete el.dataset.cu; }
            };
            el._raf = requestAnimationFrame(step);
            const host = el.closest('.bal-fx') || el;
            host.classList.remove('bal-up', 'bal-down'); void host.offsetWidth;
            host.classList.add(to > from ? 'bal-up' : 'bal-down');
            setTimeout(() => host.classList.remove('bal-up', 'bal-down'), ms + 300);
        },

        _build(kind, amount, o) {
            o = o || {};
            let el = $('wfx'); if (el) el.remove();
            el = document.createElement('div'); el.id = 'wfx'; el.className = 'wfx ' + kind;
            const dep = kind === 'deposit';
            el.innerHTML = `
                <div class="wfx-pill"><img class="wfx-pill-coin" src="${COIN}" alt=""><span id="wfx-bal">0.00</span><b class="wfx-plus">+</b></div>
                <div class="wfx-stage">
                    <div class="wfx-ring r1"></div><div class="wfx-ring r2"></div>
                    <div class="wfx-coin"><img src="${COIN}" alt="FF coin" draggable="false"></div>
                    <div class="wfx-spark"></div>
                </div>
                <div class="wfx-title">${o.title || (dep ? 'Deposit Successful' : 'Withdrawal Requested')}</div>
                <div class="wfx-amt ${dep ? 'up' : 'down'}"><span>${dep ? '+' : '-'}₹</span><span id="wfx-amt">0</span></div>
                <div class="wfx-sub">${o.sub || (dep ? 'Adding coins to your wallet…' : 'Coins are on the way to your account…')}</div>`;
            document.body.appendChild(el);
            return el;
        },
        // little golden coins flying between two elements
        _fly(from, to, n, dur, gap) {
            const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
            for (let i = 0; i < n; i++) {
                const c = document.createElement('img'); c.src = COIN; c.className = 'wfx-fly';
                const sx = a.left + a.width / 2 - 14 + (Math.random() * 30 - 15), sy = a.top + a.height / 2 - 14 + (Math.random() * 30 - 15);
                const ex = b.left + b.width / 2 - 14, ey = b.top + b.height / 2 - 14;
                c.style.left = sx + 'px'; c.style.top = sy + 'px';
                document.body.appendChild(c);
                const mx = (sx + ex) / 2 + (Math.random() * 120 - 60), my = Math.min(sy, ey) - 40 - Math.random() * 60;
                const an = c.animate([
                    { transform: 'translate(0,0) scale(.5) rotate(0)', opacity: 0 },
                    { transform: `translate(${mx - sx}px,${my - sy}px) scale(1.1) rotate(200deg)`, opacity: 1, offset: .45 },
                    { transform: `translate(${ex - sx}px,${ey - sy}px) scale(.55) rotate(420deg)`, opacity: .9 }
                ], { duration: dur, delay: i * gap, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' });
                an.onfinish = () => c.remove();
            }
        },
        _count(id, from, to, ms, dec) {
            const el = $(id); if (!el) return; const t0 = performance.now();
            const step = (t) => { const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3); el.innerText = fmt(from + (to - from) * e, dec); if (p < 1) requestAnimationFrame(step); };
            requestAnimationFrame(step);
        },

        // ~3 second deposit animation. newBal = wallet total AFTER the deposit.
        async deposit(amount, newBal, o) {
            const old = Math.max(0, Number(newBal) - Number(amount));
            const el = W._build('deposit', amount, o);
            W._count('wfx-bal', old, old, 1, 2);
            requestAnimationFrame(() => el.classList.add('show'));
            if (window.sfx) window.sfx.deposit();
            W._count('wfx-amt', 0, Number(amount), 900, Number.isInteger(Number(amount)) ? 0 : 2);
            await wait(1100);
            el.classList.add('fly');
            const pill = el.querySelector('.wfx-pill-coin'), big = el.querySelector('.wfx-coin');
            W._fly(big, pill, 10, 650, 85);
            await wait(500);
            W._count('wfx-bal', old, Number(newBal), 1300, 2);
            el.querySelector('.wfx-pill').classList.add('pulse');
            await wait(1100);
            el.classList.add('done');
            try { window.nav && window.nav.goto('wallet', document.querySelectorAll('.nav-item')[4]); } catch (e) {}
            await wait(450);
            el.classList.remove('show'); await wait(350); el.remove();
        },

        // ~3 second withdrawal animation: balance goes DOWN and coins leave the wallet
        async withdraw(amount, newBal) {
            const old = Number(newBal) + Number(amount);
            const el = W._build('withdraw', amount);
            W._count('wfx-bal', old, old, 1, 2);
            requestAnimationFrame(() => el.classList.add('show'));
            await wait(500);
            if (window.sfx) window.sfx.withdraw();
            const pill = el.querySelector('.wfx-pill-coin'), big = el.querySelector('.wfx-coin');
            W._fly(pill, big, 10, 650, 85);
            W._count('wfx-amt', 0, Number(amount), 1000, Number.isInteger(Number(amount)) ? 0 : 2);
            await wait(350);
            W._count('wfx-bal', old, Number(newBal), 1300, 2);
            el.querySelector('.wfx-pill').classList.add('pulse', 'down');
            await wait(1300);
            el.classList.add('leave');          // coin flies away
            await wait(750);
            el.classList.remove('show'); await wait(300); el.remove();
        }
    };
    window.walletfx = W;
})();
