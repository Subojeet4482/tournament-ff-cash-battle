/**
 * Payment-verification overlay: loading -> success / pending / fail, each with its own animation.
 */
Object.assign(window.app, {
    // mode: 'loading' | 'success' | 'pending' | 'fail'.  opts: {amount, ref}
    _showVerifyOverlay: (title, sub, mode, opts) => {
        const el = document.getElementById('dep-verify-overlay'); if (!el) return;
        const card = document.getElementById('dvo-card'), icon = document.getElementById('dvo-icon');
        const $ = (id) => document.getElementById(id);
        mode = mode || 'loading'; opts = opts || {};
        el.style.display = 'flex'; requestAnimationFrame(() => el.classList.add('on'));
        $('dvo-title').innerText = title; $('dvo-sub').innerText = sub;
        card.dataset.mode = mode;
        const info = $('dvo-info');
        if (opts.amount != null || opts.ref) {
            info.style.display = 'flex';
            if (opts.amount != null) $('dvo-amt').innerText = '₹' + opts.amount;
            if (opts.ref) { $('dvo-ref').innerText = opts.ref; $('dvo-ref-lbl').innerText = opts.refLabel || 'UTR / Txn ID'; }
        }
        const coin = '<img class="dvo-coin" src="assets/img/ff-coin.png" alt="FF coin" draggable="false">';
        const steps = $('dvo-steps'), timer = $('dvo-timer'), closeBtn = $('dvo-close'), bar = $('dvo-barwrap');
        const setSteps = (n) => steps.querySelectorAll('.dvo-step').forEach((s) => s.classList.toggle('on', +s.dataset.s <= n));
        steps.querySelectorAll('.dvo-line').forEach((l, i) => l.classList.toggle('on', (i + 2) <= (mode === 'success' ? 3 : mode === 'pending' ? 2 : mode === 'loading' ? 2 : 1)));
        if (mode === 'success') {
            icon.innerHTML = '<i class="fa-solid fa-check"></i>'; setSteps(3);
            timer.style.display = 'none'; closeBtn.style.display = 'none'; bar.style.display = 'none';
        } else if (mode === 'pending') {
            icon.innerHTML = '<i class="fa-solid fa-hourglass-half"></i>'; setSteps(2);
            timer.style.display = 'none'; closeBtn.style.display = 'inline-block'; closeBtn.innerText = 'OK, got it'; bar.style.display = 'block';
            const b = $('dvo-bar'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
        } else if (mode === 'fail') {
            icon.innerHTML = '<i class="fa-solid fa-xmark"></i>'; setSteps(1);
            timer.style.display = 'none'; closeBtn.style.display = 'inline-block'; closeBtn.innerText = 'Close'; bar.style.display = 'none';
        } else {
            icon.innerHTML = coin; setSteps(2);
            timer.style.display = 'block'; closeBtn.style.display = 'none'; bar.style.display = 'block';
            const b = $('dvo-bar'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
        }
    },
    _hideVerifyOverlay: () => {
        const el = document.getElementById('dep-verify-overlay'); if (!el) return;
        el.classList.remove('on'); setTimeout(() => { if (!el.classList.contains('on')) el.style.display = 'none'; }, 300);
    },
});
