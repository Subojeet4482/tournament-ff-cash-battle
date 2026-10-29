/**
 * Forgot / reset password flow.
 *  email -> (link mailed) waiting page -> user opens the link from the mail -> ?mode=resetPassword&oobCode=...
 *  -> app me "Set new password" page -> success.
 * NOTE: the link opens inside the app only when Firebase Console > Authentication > Templates > Password reset
 * > "Customize action URL" is set to the app's URL. Otherwise Firebase's default page opens (it still works).
 */
import { sendPasswordResetEmail, verifyPasswordResetCode, confirmPasswordReset, authService } from '../../js/core/firebase.js';

const $ = (id) => document.getElementById(id);
const COOLDOWN = 180000; // 3 min
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let st = { email: '', code: '', timer: null, fromLink: false };

const stopTimer = () => { if (st.timer) { clearInterval(st.timer); st.timer = null; } };

const setStep = (name) => {
    const box = $('fp-steps'); if (!box) return;
    const cur = box.querySelector('.fp-step:not(.hidden)'), next = box.querySelector(`.fp-step[data-s="${name}"]`);
    if (!next || cur === next) return;
    $('fp-wrapper').dataset.step = name;
    const h0 = box.offsetHeight;
    if (cur) cur.classList.add('hidden');
    next.classList.remove('hidden', 'fp-in'); void next.offsetWidth; next.classList.add('fp-in');
    if ($('fp-wrapper').classList.contains('active')) {
        const h1 = box.offsetHeight;
        box.style.height = h0 + 'px'; void box.offsetHeight; box.style.height = h1 + 'px';
        setTimeout(() => { box.style.height = ''; }, 480);
    }
};

const shake = (inputs) => {
    const b = $('fp-box'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
    (inputs || []).forEach(i => { if (i) { i.classList.remove('invalid'); void i.offsetWidth; i.classList.add('invalid'); } });
    if (navigator.vibrate) try { navigator.vibrate(50); } catch (e) {}
};
const busy = (btn, on, label) => {
    if (!btn) return;
    if (on) { if (!btn.dataset.l) btn.dataset.l = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> ' + label; }
    else { btn.disabled = false; if (btn.dataset.l) btn.innerHTML = btn.dataset.l; }
};
const notify = (type, title, message, dur) => {
    if (window.ui && window.ui.notify) window.ui.notify({ type, title, message, duration: dur || 6000 });
    else window.ui.toast(message);
};
const cleanUrl = () => { try { history.replaceState(null, '', location.pathname + (location.hash && !/^#(menu|modal)/.test(location.hash) ? location.hash : '')); } catch (e) {} };
const errMsg = (e) => {
    const c = (e && e.code) || '';
    if (c === 'auth/invalid-email') return 'Please enter a valid email address.';
    if (c === 'auth/user-not-found') return 'No account was found with this email.';
    if (c === 'auth/too-many-requests') return 'Too many requests. Please wait a few minutes and try again.';
    if (c === 'auth/network-request-failed') return 'Network error. Please check your internet connection.';
    if (c === 'auth/weak-password') return 'Password must be at least 6 characters long.';
    return (e && e.message) || 'Something went wrong. Please try again.';
};

// ---------- resend countdown on the waiting page ----------
const startCountdown = (email) => {
    stopTimer();
    const key = 'fp_last_' + email.toLowerCase(), btn = $('fp-resend-btn'), bar = $('fp-bar');
    const tick = () => {
        const left = COOLDOWN - (Date.now() - parseInt(localStorage.getItem(key) || '0'));
        if (left <= 0) { stopTimer(); bar.style.width = '0%'; btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Resend link'; return; }
        const s = Math.ceil(left / 1000);
        bar.style.width = (left / COOLDOWN * 100) + '%';
        btn.disabled = true; btn.innerText = 'Resend link in ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    };
    tick(); if (!btn.disabled) return; st.timer = setInterval(tick, 1000);
};

const showSent = (email) => {
    $('fp-sent-email').innerText = email;
    const g = $('fp-gmail'); g.classList.toggle('hidden', !/@(gmail|googlemail)\.com$/i.test(email));
    setStep('sent'); startCountdown(email);
};

const show = (step) => {
    const w = $('fp-wrapper'); w.classList.add('active');
    setStep(step);
};

Object.assign(window.auth, {
    // From the "Forgot Password?" link on the login screen
    forgot: () => {
        const pref = ($('login-email') && $('login-email').value || '').trim();
        const f = $('forgot-email'); if (f) f.value = pref;
        st.fromLink = false;
        // if a link was already sent to this email, go straight to the waiting page
        if (pref) {
            const left = COOLDOWN - (Date.now() - parseInt(localStorage.getItem('fp_last_' + pref.toLowerCase()) || '0'));
            if (left > 0) { st.email = pref; $('fp-wrapper').classList.add('active'); showSent(pref); return; }
        }
        show('email');
        setTimeout(() => { if (window.innerWidth > 700 && f) f.focus(); }, 500);
    },
    fpClose: () => {
        stopTimer(); $('fp-wrapper').classList.remove('active');
        if (st.fromLink) { cleanUrl(); st.fromLink = false; if (window.auth.showAuth) window.auth.showAuth(); }
        setTimeout(() => { setStep('email'); }, 450);
    },
    fpChangeEmail: () => {
        stopTimer(); st.code = '';
        const f = $('forgot-email'); if (f) { f.value = st.email || ''; }
        setStep('email'); setTimeout(() => { if (window.innerWidth > 700 && f) f.focus(); }, 400);
    },
    fpToLogin: () => {
        stopTimer(); $('fp-wrapper').classList.remove('active'); cleanUrl(); st.fromLink = false;
        const em = st.email; st.code = '';
        if (window.auth.showAuth) window.auth.showAuth();
        setTimeout(() => {
            if (window.auth.switch) window.auth.switch('login');
            const le = $('login-email'); if (le && em) le.value = em;
            const lp = $('login-pass'); if (lp) { lp.value = ''; setTimeout(() => lp.focus(), 500); }
        }, 120);
        setTimeout(() => setStep('email'), 450);
    },

    sendForgot: async () => {
        const input = $('forgot-email'), btn = $('forgot-send-btn');
        const email = (input.value || '').trim();
        if (!email) { shake([input]); return notify('error', 'Email required', 'Please enter your registered email address.'); }
        if (!/^\S+@\S+\.\S+$/.test(email)) { shake([input]); return notify('error', 'Invalid email', 'Please enter a valid email address.'); }
        const key = 'fp_last_' + email.toLowerCase();
        const left = COOLDOWN - (Date.now() - parseInt(localStorage.getItem(key) || '0'));
        st.email = email;
        if (left > 0) { return showSent(email); }   // link already sent -> waiting page
        busy(btn, true, 'Sending…');
        try {
            await sendPasswordResetEmail(authService, email);
            localStorage.setItem(key, Date.now().toString());
            busy(btn, false);
            showSent(email);
            notify('success', 'Reset link sent', 'Please check your inbox and your Spam folder.', 7000);
        } catch (e) {
            busy(btn, false); shake([input]);
            notify('error', 'Could not send link', errMsg(e));
        }
    },
    fpResend: async () => {
        const btn = $('fp-resend-btn'), email = st.email; if (!email) return;
        busy(btn, true, 'Sending…');
        try {
            await sendPasswordResetEmail(authService, email);
            localStorage.setItem('fp_last_' + email.toLowerCase(), Date.now().toString());
            busy(btn, false);
            notify('success', 'Link sent again', 'Check your inbox and Spam folder.', 7000);
            startCountdown(email);
        } catch (e) { busy(btn, false); notify('error', 'Could not send link', errMsg(e)); startCountdown(email); }
    },

    // ---- set-new-password page ----
    fpCheckPw: () => {
        const a = $('fp-new').value, b = $('fp-new2').value;
        const ok = { len: a.length >= 6, mix: /[a-z]/.test(a) && /[A-Z]/.test(a), num: /\d/.test(a), match: !!a && a === b };
        document.querySelectorAll('#fp-rules li').forEach(li => {
            const r = li.dataset.r, on = ok[r];
            if (li.classList.contains('ok') !== on) { li.classList.toggle('ok', on); const i = li.querySelector('i'); i.className = on ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle'; }
        });
        let s = 0; if (a.length >= 6) s++; if (a.length >= 9) s++; if (ok.mix) s++; if (ok.num) s++; if (/[^A-Za-z0-9]/.test(a)) s++;
        const lvl = !a ? 0 : s <= 1 ? 1 : s <= 3 ? 2 : 3, bar = $('fp-bar-str'), lbl = $('fp-lbl-str');
        bar.style.width = ['0%', '33%', '66%', '100%'][lvl]; bar.style.background = ['transparent', '#ef4444', '#f59e0b', '#10b981'][lvl];
        lbl.innerText = ['', 'Weak', 'Good', 'Strong'][lvl]; lbl.style.color = ['', '#ef4444', '#f59e0b', '#10b981'][lvl];
        return ok;
    },
    fpSavePw: async () => {
        const a = $('fp-new'), b = $('fp-new2'), btn = $('fp-save-btn');
        const ok = window.auth.fpCheckPw();
        if (!ok.len) { shake([a]); return notify('error', 'Password too short', 'Password must be at least 6 characters long.'); }
        if (!ok.match) { shake([b]); return notify('error', "Passwords don't match", 'Please type the same password in both fields.'); }
        busy(btn, true, 'Updating…');
        try {
            await confirmPasswordReset(authService, st.code, a.value);
            a.value = ''; b.value = ''; st.code = '';
            busy(btn, false);
            cleanUrl(); st.fromLink = false;
            setStep('done');
        } catch (e) {
            busy(btn, false);
            const c = (e && e.code) || '';
            if (c === 'auth/expired-action-code' || c === 'auth/invalid-action-code') { $('fp-invalid-msg').innerText = 'This reset link has expired or was already used. Please request a new one.'; setStep('invalid'); }
            else { shake([a]); notify('error', 'Could not update password', errMsg(e)); }
        }
    },
});

// ---- On app open: did the user arrive from a reset link? ----
(async () => {
    try {
        const p = new URLSearchParams(location.search);
        if (p.get('mode') !== 'resetPassword' || !p.get('oobCode')) return;
        st.code = p.get('oobCode'); st.fromLink = true;
        show('verifying');
        try {
            const email = await verifyPasswordResetCode(authService, st.code);
            st.email = email; $('fp-reset-email').innerText = email;
            await new Promise(r => setTimeout(r, 700));
            setStep('reset'); setTimeout(() => { if (window.innerWidth > 700) $('fp-new').focus(); }, 500);
        } catch (e) {
            const c = (e && e.code) || '';
            $('fp-invalid-msg').innerText = (c === 'auth/network-request-failed') ? 'Network error. Please check your internet connection and open the link again.' : 'This reset link has expired or was already used. Please request a new one.';
            setStep('invalid');
        }
    } catch (e) {}
})();
