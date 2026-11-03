/**
 * UI polish helpers (no dependencies):
 *  1) Material-style ripple on buttons / chips / tabs
 *  2) "bump" animation when a balance or counter value changes
 */
(function () {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 1) ripple ---------------------------------------------------------------
    const HOSTS = '.btn-main,.claim-btn,.nf-btn,.filter-chip,.mm-tab,.dm-item,.action-icon,.wallet-pill,.nf-clear';
    if (!reduce) {
        document.addEventListener('pointerdown', (e) => {
            const host = e.target.closest && e.target.closest(HOSTS);
            if (!host || host.disabled || host.classList.contains('disabled')) return;
            const r = host.getBoundingClientRect();
            const size = Math.max(r.width, r.height) * 2;
            const dot = document.createElement('span');
            dot.className = 'fx-ripple';
            dot.style.width = dot.style.height = size + 'px';
            dot.style.left = (e.clientX - r.left - size / 2) + 'px';
            dot.style.top = (e.clientY - r.top - size / 2) + 'px';
            host.appendChild(dot);
            dot.addEventListener('animationend', () => dot.remove(), { once: true });
            setTimeout(() => dot.remove(), 900);
        }, { passive: true });
    }

    // 2) value bump -----------------------------------------------------------
    const WATCH = ['header-coins', 'wallet-balance', 'wallet-deposit-bal', 'wallet-withdraw-bal', 'drawer-bal'];
    const last = {};
    const bump = (el) => { el.classList.remove('val-bump'); void el.offsetWidth; el.classList.add('val-bump'); setTimeout(() => el.classList.remove('val-bump'), 700); };
    const watch = () => {
        WATCH.forEach((id) => {
            const el = document.getElementById(id);
            if (!el || el._pl) return;
            el._pl = true; last[id] = el.textContent;
            new MutationObserver(() => {
                const now = el.textContent;
                const prev = last[id]; last[id] = now;
                // ignore the first real value, "Login", empty and count-up ticks that start from 0
                if (reduce || !prev || prev === now || isNaN(parseFloat(prev)) || isNaN(parseFloat(now))) return;
                if (el.dataset.cu) return;                                   // ui.countUp is running
                if (parseFloat(prev) === 0) return;
                bump(el);
            }).observe(el, { childList: true, characterData: true, subtree: true });
        });
    };
    watch(); setTimeout(watch, 1500); setTimeout(watch, 4000);
})();
