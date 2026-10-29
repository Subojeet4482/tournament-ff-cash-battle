/**
 * Top-right notification toasts (stackable, auto-hide after 6s, close "x" button).
 *   ui.notify({ type:'success'|'error'|'info', title, message, duration=6000, sound })
 * The existing ui.toast (bottom pill) keeps working separately.
 */
Object.assign(window.ui, {
    notify: (opts) => {
        opts = opts || {};
        const MAX = 4, DUR = opts.duration || 6000;
        let stack = document.getElementById('notify-stack');
        if (!stack) { stack = document.createElement('div'); stack.id = 'notify-stack'; document.body.appendChild(stack); }
        while (stack.children.length >= MAX) stack.firstElementChild.remove();

        const type = opts.type || 'success';
        const icon = type === 'error' ? 'fa-circle-xmark' : type === 'info' ? 'fa-circle-info' : 'fa-circle-check';
        const el = document.createElement('div');
        el.className = 'notify-card notify-' + type;
        el.setAttribute('role', 'status');
        el.innerHTML =
            '<div class="notify-ico"><i class="fa-solid ' + icon + '"></i></div>' +
            '<div class="notify-body"><div class="notify-title"></div><div class="notify-msg"></div></div>' +
            '<button type="button" class="notify-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
            '<span class="notify-bar"></span>';
        el.querySelector('.notify-title').textContent = opts.title || '';
        el.querySelector('.notify-msg').textContent = opts.message || '';
        el.querySelector('.notify-bar').style.animationDuration = DUR + 'ms';

        let timer = null, closed = false;
        const close = () => {
            if (closed) return; closed = true; clearTimeout(timer);
            el.classList.add('out');
            setTimeout(() => el.remove(), 300);
        };
        el.querySelector('.notify-close').addEventListener('click', close);
        stack.appendChild(el);
        requestAnimationFrame(() => el.classList.add('in'));
        timer = setTimeout(close, DUR);

        if (opts.sound) {
            try {
                const key = opts.sound === 'withdrawal' ? 'vol_withdrawal' : 'vol_notification';
                const a = document.getElementById('audio-' + opts.sound);
                const v = parseInt(localStorage.getItem(key) || '80');
                if (a && v > 0) { a.volume = v / 100; a.currentTime = 0; a.play().catch(() => {}); }
            } catch (e) {}
        }
        return { close };
    },
});
