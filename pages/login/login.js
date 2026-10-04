/**
 * Login / logout / forgot-password + auth modal show/hide.
 */
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, authService } from '../../js/core/firebase.js';

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (id) => document.getElementById(id);
const friendly = (e) => {
    const c = (e && e.code) || '';
    if(['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-login-credentials'].includes(c)) return 'Email ya password galat hai';
    if(c === 'auth/too-many-requests') return 'Bahut zyada attempts. Thodi der baad try karo';
    if(c === 'auth/network-request-failed') return 'Network error — internet check karo';
    if(c === 'auth/email-already-in-use') return 'Ye email already registered hai';
    if(c === 'auth/weak-password') return 'Password kam se kam 6 characters ka rakho';
    if(c === 'auth/account-exists-with-different-credential') return 'Ye email pehle password se register hai — password se login karo';
    if(c === 'auth/invalid-email') return 'Email format sahi nahi hai';
    return (e && e.message) || 'Something went wrong';
};

window.auth = {
    _friendly: friendly,
    _wait: wait,

    showAuth: () => {
        window.auth._reset();
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
            await signInWithEmailAndPassword(authService, email, pass);
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
        provider.setCustomParameters({ prompt: 'select_account' }); // hamesha account list dikhao
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
            window.ui.toast(c === 'auth/unauthorized-domain' ? 'Is domain ko Firebase Authorized domains me add karo' : friendly(e));
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
    forgot: () => {
        const pref = (document.getElementById('login-email').value||'').trim();
        const f=document.getElementById('forgot-email'); if(f) f.value=pref;
        window.ui.openModal('modal-forgot');
    },
    sendForgot: async () => {
        const email=(document.getElementById('forgot-email').value||'').trim();
        if(!email) return window.ui.toast('Email required');
        const key='fp_last_'+email.toLowerCase();
        const last=parseInt(localStorage.getItem(key)||'0');
        const wait=180000-(Date.now()-last);
        if(wait>0){
            const s=Math.ceil(wait/1000);
            return window.ui.toast(`Please wait ${Math.floor(s/60)}m ${s%60}s before requesting again`);
        }
        const btn=document.getElementById('forgot-send-btn'); if(btn){ btn.disabled=true; btn.innerText='Sending...'; }
        try {
            await sendPasswordResetEmail(authService, email);
            localStorage.setItem(key, Date.now().toString());
            window.ui.toast('Reset link sent to '+email);
            window.ui.closeModal();
        } catch(e){ window.ui.toast(e.message); }
        finally { if(btn){ btn.disabled=false; btn.innerText='Send Reset Link'; } }
    },
};

// Redirect fallback se wapas aane par welcome dikhao (auth-state.js baaki sab handle karta hai)
getRedirectResult(authService).then(r => {
    if(r && r.user){ setTimeout(() => window.auth._welcome && window.auth._welcome(r.user.displayName || 'Player', 'Google login successful'), 600); }
}).catch(() => {});
