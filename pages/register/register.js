/**
 * Register new account.
 * Flow: Firebase user is created -> verification link is sent -> "Verify your email" screen (60s).
 *  - verified within 60s  -> Firestore profile is created, then the user logs in
 *  - not verified in 60s  -> Firebase account is deleted (nothing is kept)
 * Nothing is saved to Firestore before verification.
 */
import { createUserWithEmailAndPassword, updateProfile, collection, getDocs, doc, setDoc, getDoc, query, where, signOut, deleteUser, authService, dbService } from '../../js/core/firebase.js';

const WINDOW_MS = 60000;          // time allowed to verify
const PKEY = 'pending_reg';       // { uid, name, phone, email, ts } (the password is never stored)
const $ = (id) => document.getElementById(id);
const readPending = () => { try { return JSON.parse(localStorage.getItem(PKEY) || 'null'); } catch(e){ return null; } };
const clearPending = () => localStorage.removeItem(PKEY);
let watch = null;

const stopWatch = () => { if(watch){ clearInterval(watch.t); document.removeEventListener('visibilitychange', watch.v); watch = null; } };

const setView = (state, email) => {
    const box = $('auth-verify'); if(!box) return;
    box.dataset.vs = state;
    const safe = String(email || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const ico = $('av-ico').querySelector('i'), title = $('av-title'), text = $('av-text'), btn = $('av-btn');
    if(state === 'wait'){
        ico.className = 'fa-solid fa-envelope'; title.innerText = 'Verify your email';
        text.innerHTML = 'We have sent a verification link to <b>' + safe + '</b>.<br>Open the email and tap the link to verify, then login.<span class="spam-tip"><i class="fa-solid fa-inbox"></i><span>Can\'t see it? Please check your <b>Spam / Junk</b> folder too.</span></span>';
        btn.innerText = 'Cancel';
        const m = $('av-mail'); m.classList.toggle('hidden', !/@(gmail|googlemail)\.com$/i.test(email || ''));
    } else if(state === 'ok'){
        ico.className = 'fa-solid fa-circle-check'; title.innerText = 'Email verified!';
        text.innerHTML = 'Your account is ready.<br>You can login now.';
        btn.innerText = 'Go to Login';
    } else {
        ico.className = 'fa-solid fa-hourglass-end'; title.innerText = "Time's up";
        text.innerHTML = 'Your email was not verified within 60 seconds, so the registration was cancelled.<br>Please register again.';
        btn.innerText = 'Register Again';
    }
    $('auth-card').classList.add('is-verify');
};

const finishVerified = async (user, info) => {
    stopWatch();
    try { await user.getIdToken(true); } catch(e){}
    try { await window.auth._ensureProfile(user); } catch(e){}
    try { await signOut(authService); } catch(e){}
    setView('ok', info.email);
    if(!$('auth-modal-wrapper').classList.contains('active')) window.ui.toast('Email verified! Please login.');
};

const expire = async (user, info) => {
    stopWatch();
    let gone = false;
    try { await deleteUser(user); gone = true; } catch(e){ if(e && (e.code === 'auth/user-not-found' || e.code === 'auth/user-token-expired')) gone = true; }
    if(gone) clearPending(); else { try { await signOut(authService); } catch(e){} } // if the delete fails, it is retried on the next app open
    setView('expired', info.email);
};

const startWatch = (user, info) => {
    stopWatch();
    const deadline = info.ts + WINDOW_MS;
    setView('wait', info.email);
    let n = 0, busy = false;
    const tick = async () => {
        if(!watch || busy) return;
        const left = deadline - Date.now(), secs = Math.max(0, Math.ceil(left / 1000));
        $('av-bar').style.width = Math.max(0, left / WINDOW_MS * 100) + '%';
        const t = $('av-time'); t.innerText = 'Verify within ' + secs + 's or registration is cancelled'; t.classList.toggle('low', secs <= 10);
        busy = true;
        try {
            if(n++ % 2 === 0 || left <= 0){
                try { await user.reload(); } catch(e){ if(e && e.code === 'auth/user-not-found'){ clearPending(); stopWatch(); setView('expired', info.email); return; } }
                if(user.emailVerified) return await finishVerified(user, info);
            }
            if(left <= 0) await expire(user, info);
        } finally { busy = false; }
    };
    watch = { t: setInterval(tick, 1000), v: () => { if(!document.hidden) tick(); } };
    document.addEventListener('visibilitychange', watch.v);
    tick();
};

Object.assign(window.auth, {
    // The profile is created in Firestore only once the email is verified (or for Google users). Name/phone come from the pending data.
    _ensureProfile: async (user) => {
        try {
            const ref = doc(dbService, "users", user.uid);
            if((await getDoc(ref)).exists()){ const p = readPending(); if(p && p.uid === user.uid) clearPending(); return true; }
            const p = readPending(), info = (p && p.uid === user.uid) ? p : {};
            let playerId = "", tries = 0;
            while(tries < 20){
                playerId = String(Math.floor(1000000 + Math.random()*9000000));
                const dup = await getDocs(query(collection(dbService,"users"), where("playerId","==",playerId)));
                if(dup.empty) break;
                tries++;
            }
            await setDoc(ref, {
                appName: info.name || user.displayName || (user.email||'Player').split('@')[0], email: user.email||"", phone: info.phone || user.phoneNumber || "",
                balance:0, depositBalance:0, withdrawBalance:0, uid:user.uid, playerId,
                joined_matches:[], score:0, kills:0, matchesPlayed:0, matchesWon:0, totalEarned:0,
                gameName:"", gameUid:"", isUidVerified:false, photoUrl:user.photoURL||"", nameChangesLeft:2
            });
            if(info.uid) clearPending();
            return true;
        } catch(e) { console.error('ensureProfile', e); return false; }
    },
    // When the app reopens (the tab was closed), resume or clean up the pending account
    _resumePending: async (user) => {
        const info = readPending(); if(!info || info.uid !== user.uid || watch) return;
        try { await user.reload(); } catch(e){}
        if(user.emailVerified){ await window.auth._ensureProfile(user); try { await signOut(authService); } catch(e){} window.auth.showAuth(); setView('ok', info.email); return; }
        if(Date.now() >= info.ts + WINDOW_MS){
            try { await deleteUser(user); clearPending(); } catch(e){ if(e && e.code === 'auth/user-not-found') clearPending(); }
            return;
        }
        window.auth.showAuth(); startWatch(user, info);
    },
    _verifyReset: () => { if(!watch) $('auth-card').classList.remove('is-verify'); },
    verifyAction: async () => {
        const st = $('auth-verify').dataset.vs;
        if(st === 'wait'){ // cancel: account turant delete
            const u = authService.currentUser, info = readPending() || {};
            stopWatch();
            if(u){ try { await deleteUser(u); clearPending(); } catch(e){ try { await signOut(authService); } catch(_){} } }
            $('auth-card').classList.remove('is-verify'); window.auth._busy($('btn-register'), false);
            return;
        }
        $('auth-card').classList.remove('is-verify');
        if(st === 'ok'){ const em = $('reg-email').value; window.auth.switch('login'); if(em) $('login-email').value = em; $('reg-pass').value = ''; setTimeout(() => $('login-pass') && $('login-pass').focus(), 500); }
        else { $('reg-pass').value = ''; window.auth.switch('register'); }
    },
    register: async () => {
        const g=(id)=>document.getElementById(id);
        const nameEl=g('reg-name'), phoneEl=g('reg-phone'), emailEl=g('reg-email'), passEl=g('reg-pass'), btn=g('btn-register');
        const name=nameEl.value, email=emailEl.value.trim(), phone=phoneEl.value, pass=passEl.value;
        if(!name||!email||!pass||!phone){ window.auth._fail([!name&&nameEl,!phone&&phoneEl,!email&&emailEl,!pass&&passEl]); return window.ui.toast('Please fill in all the fields to create your account.'); }
        if(phone.length<10){ window.auth._fail([phoneEl]); return window.ui.toast('Please enter a valid 10-digit phone number.'); }
        window.auth._busy(btn,true,'Creating account...');
        window.auth._registering = true;
        let created = null;
        try {
            const cred=await createUserWithEmailAndPassword(authService,email,pass);
            created = cred.user;
            await updateProfile(cred.user,{displayName:name});
            const info = { uid:cred.user.uid, name, phone, email, ts:Date.now() };
            localStorage.setItem(PKEY, JSON.stringify(info));
            const vr = await window.auth._sendVerify(cred.user);
            if(vr !== 'sent' && vr !== 'wait') throw { code:'auth/verify-send-failed', message:'We could not send the verification email. Please check the email address and try again.' };
            info.ts = Date.now(); localStorage.setItem(PKEY, JSON.stringify(info));
            window.auth._busy(btn,false);
            startWatch(cred.user, info);
        } catch(e) {
            if(created){ try { await deleteUser(created); } catch(_){} clearPending(); }
            window.auth._busy(btn,false); window.auth._fail([emailEl,passEl]); window.ui.toast(window.auth._friendly?window.auth._friendly(e):e.message);
        } finally { window.auth._registering = false; }
    },
});
