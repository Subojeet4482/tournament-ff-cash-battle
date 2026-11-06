/**
 * Drawer: "pull the wallet card out" gesture.
 * Drag the Total Balance card sideways -> a copy of the card lifts off and follows the finger,
 * leaving an empty slot behind. Pull far enough (or flick) and the card flies out,
 * the drawer closes and the Wallet page opens. Let go early and the card springs back.
 */
(() => {
    const THRESHOLD = 80;      // px of pull needed
    const FLICK_SPEED = 0.6;   // px/ms — a quick flick also counts
    const START_MOVE = 8;      // px before we treat it as a drag (so taps on the button still work)
    let st = null, justDragged = false;

    const goWallet = () => {
        window.ui.toggleDrawer();
        window.app.checkLogin(() => window.nav.goto('wallet', document.querySelectorAll('.nav-item')[4]));
    };

    document.addEventListener('pointerdown', (e) => {
        const card = e.target.closest && e.target.closest('.drawer-wallet');
        if (!card || (e.pointerType === 'mouse' && e.button !== 0) || st) return;
        st = { card, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, t0: performance.now(), lastX: e.clientX, lastT: performance.now(), v: 0, clone: null, dragging: false };
    });

    document.addEventListener('pointermove', (e) => {
        if (!st || e.pointerId !== st.id) return;
        const dx = e.clientX - st.x0, dy = e.clientY - st.y0;
        if (!st.dragging) {
            // vertical scroll wins -> cancel
            if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > START_MOVE) { st = null; return; }
            if (Math.abs(dx) < START_MOVE) return;
            lift();
        }
        const now = performance.now();
        st.v = (e.clientX - st.lastX) / Math.max(1, now - st.lastT);
        st.lastX = e.clientX; st.lastT = now; st.dx = dx;
        e.preventDefault();
        const p = Math.min(1, Math.abs(dx) / THRESHOLD);
        st.clone.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${Math.max(-10, Math.min(10, dx * 0.05))}deg) scale(${1 + 0.04 * p})`;
        st.clone.classList.toggle('ready', Math.abs(dx) >= THRESHOLD);
    }, { passive: false });

    const finish = (e) => {
        if (!st || (e && e.pointerId !== st.id)) return;
        const s = st; st = null;
        if (!s.dragging) return;
        justDragged = true; setTimeout(() => justDragged = false, 350);
        const pulled = Math.abs(s.dx) >= THRESHOLD || Math.abs(s.v) >= FLICK_SPEED && Math.abs(s.dx) > 30;
        const loggedIn = !!(window.db && window.db.user_uid);
        if (pulled && loggedIn) fly(s); else back(s, pulled && !loggedIn);
    };
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);

    // swallow the click that follows a drag (so "Go to Wallet" doesn't fire twice)
    document.addEventListener('click', (e) => {
        if (justDragged && e.target.closest && e.target.closest('.drawer-wallet')) { e.stopPropagation(); e.preventDefault(); }
    }, true);

    function lift() {
        const r = st.card.getBoundingClientRect();
        const c = st.card.cloneNode(true);
        c.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
        c.classList.add('dw-clone');
        Object.assign(c.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
        document.body.appendChild(c);
        st.card.classList.add('pulled');
        st.clone = c; st.dragging = true;
        if (navigator.vibrate) try { navigator.vibrate(8); } catch (_) {}
    }

    function restoreSlot(card) {
        card.classList.remove('pulled');
        card.classList.add('dw-return');
        setTimeout(() => card.classList.remove('dw-return'), 600);
    }

    // not far enough -> spring back into the slot
    function back(s, needLogin) {
        const c = s.clone;
        c.classList.add('settling');
        c.style.transform = 'translate(0,0) rotate(0) scale(1)';
        setTimeout(() => { c.remove(); restoreSlot(s.card); if (needLogin) window.app.checkLogin(() => {}); }, 420);
    }

    // far enough -> card flies out, wallet opens
    function fly(s) {
        const c = s.clone, dir = s.dx >= 0 ? 1 : -1;
        c.classList.add('flying');
        c.style.transform = `translate(${dir * (innerWidth + 200)}px, ${-30}px) rotate(${dir * 24}deg) scale(1.05)`;
        c.style.opacity = '0';
        if (navigator.vibrate) try { navigator.vibrate(15); } catch (_) {}
        setTimeout(goWallet, 140);
        setTimeout(() => { c.remove(); restoreSlot(s.card); }, 650);
    }
})();
