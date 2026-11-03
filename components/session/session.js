/**
 * Session UX: animated logout (confirm sheet -> goodbye overlay) and welcome chip after login / sign-up.
 */
import { signOut, authService } from '../../js/core/firebase.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise(r => setTimeout(r, ms));

Object.assign(window.auth, {
    // Step 1: ask (animated sheet instead of the browser confirm box)
    logout: () => window.ui.openModal('modal-logout'),

    // Step 2: goodbye animation, then real sign-out
    confirmLogout: async () => {
        const ov = $('session-overlay');
        window.ui.closeModal();
        ov.classList.remove('done'); ov.classList.add('show');
        $('so-icon').className = 'fa-solid fa-right-from-bracket';
        $('so-title').innerText = 'Logging out…'; $('so-sub').innerText = 'Securing your session';
        try {
            await wait(1000);
            await signOut(authService);
            window.nav.goto('home', document.querySelectorAll('.nav-item')[0]);
            ov.classList.add('done');
            $('so-icon').className = 'fa-solid fa-check';
            $('so-title').innerText = 'Logged out'; $('so-sub').innerText = 'See you soon 👋';
            await wait(1100);
        } catch(e){
            window.ui.toast('Logout failed: ' + (e.message || e));
        }
        ov.classList.remove('show');
        setTimeout(() => ov.classList.remove('done'), 500);
    },

    // Slide-down welcome chip after explicit login / register
    _welcome: (name, sub) => {
        const c = $('welcome-chip'); if(!c) return;
        $('wc-title').innerText = 'Welcome, ' + (name || 'Player') + '!';
        $('wc-sub').innerText = sub || '';
        c.classList.remove('show'); void c.offsetWidth;
        setTimeout(() => c.classList.add('show'), 350);
        clearTimeout(c._t); c._t = setTimeout(() => c.classList.remove('show'), 3400);
    },
});
