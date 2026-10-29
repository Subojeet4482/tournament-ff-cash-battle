/**
 * Login / logout / forgot-password + auth modal show/hide.
 */
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, sendEmailVerification, authService } from '../../js/core/firebase.js';

// Only email/password accounts created AFTER this date must verify (older users are not locked out).
// Set this to 0 to force everyone to verify.
const VERIFY_REQUIRED_FROM = Date.parse('2026-10-04T00:00:00Z');
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (id) => document.getElementById(id);
const friendly = (e) => {
    const c = (e && e.code) || '';
    if(['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-login-credentials'].includes(c)) return 'Incorrect email or password. Please check and try again.';
    if(c === 'auth/too-many-requests') return 'Too many attempts. Please wait a few minutes and try again.';
    if(c === 'auth/network-request-failed') return 'Network error. Please check your internet connection.';
    if(c === 'auth/email-already-in-use') return 'This email is already registered. Try logging in instead.';
    if(c === 'auth/weak-password') return 'Password must be at least 6 characters long.';
    if(c === 'auth/account-exists-with-different-credential') return 'This email is registered with a password. Please log in using your password.';
    if(c === 'auth/unverified-email') return 'Email not verified yet. Please check your inbox (and spam folder) for the verification link.';
    if(c === 'auth/invalid-email') return 'Please enter a valid email address.';
    return (e && e.message) || 'Something went wrong';
};

window.auth = {
    _friendly: friendly,
    _verifyFrom: VERIFY_REQUIRED_FROM,
    // Email/password user who has not opened the verification link yet
    _needsVerify: (u) => !!u && !u.emailVerified
        && (u.providerData||[]).some(p => p.providerId === 'password')
        && Date.parse((u.metadata && u.metadata.creationTime) || 0) >= VERIFY_REQUIRED_FROM,
    // Sends the verification mail (60s cooldown). Return: 'sent' | 'wait' | 'error'
    _sendVerify: async (user) => {
        const key = 'ev_last_' + user.uid, left = 60000 - (Date.now() - parseInt(localStorage.getItem(key) || '0'));
        if(left > 0) return 'wait';
        try {
            try { await sendEmailVerification(user, { url: location.origin + location.pathname }); }
            catch(e){ if(e && e.code === 'auth/unauthorized-continue-uri') await sendEmailVerification(user); else throw e; }
            localStorage.setItem(key, Date.now().toString()); return 'sent';
        } catch(e){ return (e && e.code === 'auth/too-many-requests') ? 'wait' : 'error'; }
    },
    _wait: wait,

    showAuth: () => {
        window.auth._reset();
        if(window.auth._verifyReset) window.auth._verifyReset();
        $('auth-modal-wrapper').classList.add('active');
        setTimeout(() => { const f = document.querySelector('.auth-form:not(.hidden) input'); if(f && window.innerWidth > 700) f.focus(); }, 650);
    },
    hideAuth: () => {
        $('auth-modal-wrapper').classList.remove('active');
        setTimeout(() => window.auth._reset(), 600);
    },
    _reset: () => {
        const card = $('auth-card'); if(!card) return;
        card.classList.remove('is-done','shake');
        document.querySelectorAll('#auth-card .btn-main').forEach(b => { b.classList.remove('loading','success'); b.disabled = false; if(b.dataset.label){ b.innerHTML = b.dataset.label; } });
        document.querySelectorAll('#auth-card .input-box').forEach(i => i.classList.remove('invalid'));
    },

    // ---- UI state helpers (used by login + register) ----
    _busy: (btn, on, label) => {
        if(!btn) return;
        if(on){
            if(!btn.dataset.label) btn.dataset.label = btn.innerHTML;
            btn.classList.add('loading'); btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> ' + label;
        } else {
            btn.classList.remove('loading'); btn.disabled = false;
            if(btn.dataset.label) btn.innerHTML = btn.dataset.label;
        }
    },
    _fail: (inputs) => {
        const card = $('auth-card');
        card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
        (inputs || []).forEach(i => { if(i){ i.classList.remove('invalid'); void i.offsetWidth; i.classList.add('invalid'); } });
        if(navigator.vibrate) try { navigator.vibrate(60); } catch(e){}
    },
    _done: async (title, sub) => {
        $('auth-done-title').innerText = title; $('auth-done-sub').innerText = sub || '';
        $('auth-card').classList.add('is-done');
        await wait(1250);
    },

    // ---- field helpers ----
    togglePw: (id, btn) => {
        const el = $(id); const show = el.type === 'password';
        el.type = show ? 'text' : 'password';
        btn.innerHTML = '<i class="fa-regular ' + (show ? 'fa-eye-slash' : 'fa-eye') + '"></i>';
        btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
    },
    keySubmit: (e, which) => { if(e.key === 'Enter'){ e.preventDefault(); which === 'login' ? window.auth.login() : window.auth.register(); } },
    pwStrength: (v) => {
        let s = 0;
        if(v.length >= 6) s++; if(v.length >= 9) s++;
        if(/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
        if(/\d/.test(v)) s++; if(/[^A-Za-z0-9]/.test(v)) s++;
        const lvl = !v ? 0 : s <= 1 ? 1 : s <= 3 ? 2 : 3;
        const bar = $('pw-bar'), lbl = $('pw-lbl');
        bar.style.width = ['0%','33%','66%','100%'][lvl];
        bar.style.background = ['transparent','#ef4444','#f59e0b','#10b981'][lvl];
        lbl.innerText = ['','Weak','Good','Strong'][lvl];
        lbl.style.color = ['','#ef4444','#f59e0b','#10b981'][lvl];
    },

    login: async () => {
        const emailEl = $('login-email'), passEl = $('login-pass'), btn = $('btn-login');
        const email = emailEl.value.trim(), pass = passEl.value;
        if(!email || !pass){ window.auth._fail([!email && emailEl, !pass && passEl]); return window.ui.toast('Fill all fields'); }
        window.auth._busy(btn, true, 'Signing in...');
        try {
            const cred = await signInWithEmailAndPassword(authService, email, pass);
            if(window.auth._needsVerify(cred.user)){
                const r = await window.auth._sendVerify(cred.user);
                await signOut(authService);
                window.auth._busy(btn, false); window.auth._fail([emailEl]);
                return window.ui.notify({ type:'info', title: r === 'sent' ? 'Verification link sent' : 'Verify your email first', message: (r === 'sent' ? 'We have sent a new verification link to your email. ' : 'Please use the verification link we already sent. ') + 'Open it to verify, and also check your Spam / Junk folder.', duration: 9000 });
            }
            const name = (authService.currentUser && authService.currentUser.displayName) || 'Player';
            await window.auth._done('Welcome back!', 'Logging you in…');
            window.auth.hideAuth(); passEl.value = '';
            if(window.auth._welcome) window.auth._welcome(name, 'Login successful');
        } catch(e) {
            window.auth._busy(btn, false);
            window.auth._fail([emailEl, passEl]);
            window.ui.toast(friendly(e));
        }
    },
    // ---- Google login (account chooser, no password) ----
    google: async () => {
        const btns = document.querySelectorAll('.btn-google');
        const setBusy = (on) => btns.forEach(b => { b.disabled = on; b.classList.toggle('loading', on); });
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' }); // always show the account list
        setBusy(true);
        try {
            const res = await signInWithPopup(authService, provider);
            const name = res.user.displayName || 'Player';
            await window.auth._done('Welcome!', 'Logging you in…');
            window.auth.hideAuth();
            if(window.auth._welcome) window.auth._welcome(name, 'Google login successful');
        } catch(e) {
            const c = (e && e.code) || '';
            if(c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment'){
                try { return await signInWithRedirect(authService, provider); } catch(e2) { e = e2; }
            }
            setBusy(false);
            if(c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return;
            window.auth._fail([]);
            window.ui.toast(c === 'auth/unauthorized-domain' ? 'This domain is not authorised for sign-in. Add it under Firebase Authorized domains.' : friendly(e));
        }
        setBusy(false);
    },
    switch: (id) => {
        const next = $('form-' + id), cur = document.querySelector('.auth-form:not(.hidden)');
        if(!next || cur === next) return;
        const tabs = $('auth-tabs'); tabs.dataset.active = id;
        tabs.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
        const sub = $('auth-sub');
        sub.classList.add('swap');
        setTimeout(() => { sub.innerText = id === 'register' ? 'Create your account & start winning' : 'Login to play matches & win'; sub.classList.remove('swap'); }, 160);

        const box = $('auth-forms'), dir = id === 'register' ? 'r' : 'l';
        if(!cur){ next.classList.remove('hidden'); return; }
        const h0 = box.offsetHeight;
        box.style.height = h0 + 'px'; box.classList.add('animating');
        cur.classList.add('auth-out');
        setTimeout(() => {
            cur.classList.add('hidden'); cur.classList.remove('auth-out');
            next.classList.remove('hidden'); next.classList.add('auth-in-' + dir);
            box.style.height = 'auto'; const h1 = box.offsetHeight;
            box.style.height = h0 + 'px'; void box.offsetHeight; box.style.height = h1 + 'px';
            setTimeout(() => { box.style.height = ''; box.classList.remove('animating'); next.classList.remove('auth-in-' + dir); }, 460);
        }, 170);
    },
};

// Show the welcome message when returning from the redirect fallback (auth-state.js handles everything else)
getRedirectResult(authService).then(r => {
    if(r && r.user){ setTimeout(() => window.auth._welcome && window.auth._welcome(r.user.displayName || 'Player', 'Google login successful'), 600); }
}).catch(() => {});
