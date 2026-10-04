/**
 * Settings: dark mode, AI mode, sounds, gear, profile + payment settings, support contacts.
 */
import { updateProfile, doc, setDoc, updateDoc, authService, dbService } from '../../js/core/firebase.js';

Object.assign(window.app, {
    toggleDarkMode: () => { const isDark=document.body.classList.toggle('dark'); localStorage.setItem('darkMode',isDark); },
    // ===== SOUND (Point 4) =====
    initSound: () => {
        const a=parseInt(localStorage.getItem('vol_app')||'50');
        const appEl=document.getElementById('audio-bg');
        if(appEl){ appEl.volume=a/100; appEl.muted=false; }
        const t=parseInt(localStorage.getItem('vol_touch')||'50');
        const touchEl=document.getElementById('audio-touch');
        if(touchEl){ touchEl.volume=t/100; touchEl.muted=false; }
        const wv=parseInt(localStorage.getItem('vol_withdrawal')||'80');
        const wEl=document.getElementById('audio-withdrawal'); if(wEl){ wEl.volume=wv/100; }
        const nv=parseInt(localStorage.getItem('vol_notification')||'80');
        const nEl=document.getElementById('audio-notification'); if(nEl){ nEl.volume=nv/100; }
        // Try to play immediately on page load
        const tryPlay=()=>{ if(appEl && a>0){ appEl.play().catch(()=>{}); } };
        tryPlay();
        // Fallback: if the browser/webview blocked autoplay, this resolves it silently on the user's very first tap (no separate action needed from them)
        const fallback=()=>{ tryPlay(); document.removeEventListener('click',fallback); document.removeEventListener('touchstart',fallback); };
        document.addEventListener('click',fallback);
        document.addEventListener('touchstart',fallback,{passive:true});
        // Play a short tap sound on every screen tap (click + touchstart, some webviews only fire one reliably)
        const playTouch=(e)=>{
            if(e.target.closest('#sound-touch')) return;
            // Touch sound only fires for bottom nav items (not the whole screen)
            if(!e.target.closest('.nav-bar .nav-item')) return;
            const tv=parseInt(localStorage.getItem('vol_touch')||'50');
            const te=document.getElementById('audio-touch');
            if(te && tv>0){ te.volume=tv/100; te.currentTime=0; te.play().catch(()=>{}); }
        };
        document.addEventListener('click',playTouch);
        document.addEventListener('touchstart',playTouch,{passive:true});
    },
    setSound: (which,val) => {
        const v=parseInt(val);
        localStorage.setItem('vol_'+which, v);
        const lbl=document.getElementById('sound-'+which+'-val'); if(lbl) lbl.innerText=v+'%';
        if(which==='app'){
            const el=document.getElementById('audio-bg'); if(el){ el.volume=v/100; if(v>0) el.play().catch(()=>{}); else el.pause(); }
        } else if(which==='touch'){
            const el=document.getElementById('audio-touch'); if(el){ el.volume=v/100; if(v>0){ el.currentTime=0; el.play().catch(()=>{}); } }
        } else if(which==='withdrawal'){
            const el=document.getElementById('audio-withdrawal'); if(el) el.volume=v/100;
        } else if(which==='notification'){
            const el=document.getElementById('audio-notification'); if(el) el.volume=v/100;
        } else if(which==='settings'){
            const el=document.getElementById('audio-settings'); if(el){ el.volume=v/100; if(v>0){ el.currentTime=0; el.play().catch(()=>{}); } }
        } else if(which==='clear'){
            const el=document.getElementById('audio-clear'); if(el){ el.volume=v/100; if(v>0){ el.currentTime=0; el.play().catch(()=>{}); } }
        }
    },
    // Gear icon: spin animation + sound + open settings drawer
    gearClick: (el) => {
        const g=document.getElementById('header-gear');
        if(g){
            g.classList.remove('gear-spin'); void g.offsetWidth; g.classList.add('gear-spin');
            g.addEventListener('animationend', function _h(){ g.classList.remove('gear-spin'); g.style.transform=''; g.removeEventListener('animationend',_h); });
        }
        try { const sv=parseInt(localStorage.getItem('vol_settings')||'80'); const s=document.getElementById('audio-settings'); if(s && sv>0){ s.volume=sv/100; s.currentTime=0; s.play().catch(()=>{}); } } catch(e){}
        window.ui.toggleDrawer();
    },
    renderSupportContacts: () => {
        const box = document.getElementById('sec-support-list');
        if(!box) return;
        const w = window.db.whatsappSupport || {};
        const t = window.db.telegramSupport || {};
        const items = [];
        if((w.link||'').trim()){
            items.push(`<div onclick="app.openWhatsApp()" style="display:flex; align-items:center; gap:12px; padding:12px; border-radius:12px; background:var(--bg-input); cursor:pointer;">
                <div style="width:40px; height:40px; border-radius:10px; background:#dcfce7; color:#16a34a; display:flex; align-items:center; justify-content:center; font-size:1.2rem;"><i class="fa-brands fa-whatsapp"></i></div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; font-size:0.92rem;">${(w.name||'WhatsApp Support').replace(/</g,'&lt;')}</div>
                    <div style="font-size:0.78rem; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${(w.link||'').replace(/</g,'&lt;')}</div>
                </div>
                <i class="fa-solid fa-arrow-up-right-from-square text-muted"></i>
            </div>`);
        }
        if((t.link||'').trim()){
            items.push(`<div onclick="app.openTelegram()" style="display:flex; align-items:center; gap:12px; padding:12px; border-radius:12px; background:var(--bg-input); cursor:pointer;">
                <div style="width:40px; height:40px; border-radius:10px; background:#e0e7ff; color:#4f46e5; display:flex; align-items:center; justify-content:center; font-size:1.2rem;"><i class="fa-brands fa-telegram"></i></div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; font-size:0.92rem;">${(t.name||'Telegram Support').replace(/</g,'&lt;')}</div>
                    <div style="font-size:0.78rem; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${(t.link||'').replace(/</g,'&lt;')}</div>
                </div>
                <i class="fa-solid fa-arrow-up-right-from-square text-muted"></i>
            </div>`);
        }
        box.innerHTML = items.length ? items.join('') : '<div style="color:var(--text-muted); font-size:0.85rem;">No support contacts configured yet.</div>';
    },
    openWhatsApp: () => {
        const w = window.db.whatsappSupport || {};
        let link = (w.link||'').trim();
        if(!link){ link = 'https://wa.me/542336410897?text=Hello%20Help%20Needed'; }
        else if(!/^https?:\/\//i.test(link)){
            const num = link.replace(/[^0-9]/g,'');
            if(num) link = 'https://wa.me/'+num+'?text=Hello%20Help%20Needed';
        }
        window.open(link,'_blank');
    },
    openTelegram: () => {
        const t = window.db.telegramSupport || {};
        let link = (t.link||'').trim();
        if(!link){ link = 'https://t.me/Tec_guru_ji'; }
        else if(!/^https?:\/\//i.test(link)){
            let h = link.replace(/^@/,'');
            link = 'https://t.me/'+h;
        }
        window.open(link,'_blank');
    },
    avatarUrl: (d) => (d && d.photoUrl) || ('https://ui-avatars.com/api/?name='+encodeURIComponent((d&&d.appName)||'User')+'&background=4f46e5&color=fff'),
    // Photo: koi bhi size chalega — center-crop 320x320 + JPEG compress (<~45KB) karke save hota hai
    handleImageUpload: (input) => {
        const f=input.files&&input.files[0]; if(!f) return;
        if(!/^image\//.test(f.type)){ input.value=''; return window.ui.toast("Sirf image select karo"); }
        if(f.size>10*1024*1024){ input.value=''; return window.ui.toast("Image bahut badi hai (max 10MB)"); }
        const img=new Image(), url=URL.createObjectURL(f);
        img.onload=()=>{
            const S=320, c=document.createElement('canvas'); c.width=c.height=S; const x=c.getContext('2d');
            const m=Math.min(img.width,img.height), sx=(img.width-m)/2, sy=(img.height-m)/2;
            x.drawImage(img,sx,sy,m,m,0,0,S,S); URL.revokeObjectURL(url);
            let q=0.85, out=c.toDataURL('image/jpeg',q);
            while(out.length>60000 && q>0.4){ q-=0.1; out=c.toDataURL('image/jpeg',q); }
            if(out.length>90000){ input.value=''; return window.ui.toast("Image compress nahi hui, dusri try karo"); }
            const el=document.getElementById('edit-profile-img'); el.src=out; window.app.tempImage=out;
            const w=el.closest('.ep-avatar'); if(w){ w.classList.remove('swap'); void w.offsetWidth; w.classList.add('swap'); }
            input.value='';
        };
        img.onerror=()=>{ URL.revokeObjectURL(url); input.value=''; window.ui.toast("Image load nahi hui"); };
        img.src=url;
    },
    saveProfile: async () => {
        const d=window.db.user_data; const appName=document.getElementById('edit-app-name').value.trim();
        const gameName=document.getElementById('edit-game-name').value.trim(); const gameUid=document.getElementById('edit-game-uid').value.trim();
        if(appName.length<3) return window.ui.toast("App Name: minimum 3 chars");
        // FF UID can be 6-12 digits (not fixed 7)
        if(gameUid && (isNaN(gameUid) || gameUid.length<6 || gameUid.length>12)) return window.ui.toast("FF UID invalid (6-12 digits)");
        const updates={};
        const left=d.nameChangesLeft!==undefined?d.nameChangesLeft:2;
        if(appName && appName!==d.appName){
            if(left<=0) return window.ui.toast("Name change limit khatam");
            updates.appName=appName; updates.nameChangesLeft=left-1; // counter sirf ghat sakta hai (rules)
        }
        if(gameName && gameName!==d.gameName) updates.gameName=gameName;
        if(gameUid && !d.isUidVerified && gameUid!==String(d.gameUid||'')) updates.gameUid=gameUid;
        if(window.app.tempImage) updates.photoUrl=window.app.tempImage;
        if(!Object.keys(updates).length){ window.ui.closeModal(); return window.ui.toast("Kuch change nahi hua"); }
        const btn=document.getElementById('ep-save');
        if(btn){ btn.disabled=true; btn.classList.add('saving'); btn.innerHTML='<i class="fa-solid fa-circle-notch"></i> Saving...'; }
        try {
            if(updates.appName){ try { await updateProfile(authService.currentUser,{displayName:appName}); } catch(e){} }
            await setDoc(doc(dbService,"users",window.db.user_uid),updates,{merge:true});
            window.app.tempImage=null;
            await window.app.fetchUserData(); window.ui.closeModal(); window.ui.toast("Profile Updated!");
            // drawer ka naam/photo turant refresh
            const u=window.db.user_data; const pn=document.getElementById('profile-name'); const pi=document.getElementById('profile-img');
            if(pi) pi.src=window.app.avatarUrl(u);
            if(pn && updates.appName){ const sp=pn.querySelector('span'); if(sp) sp.textContent=updates.appName; }
        } catch(e){ window.ui.toast("Error: "+e.message); }
        finally { if(btn){ btn.disabled=false; btn.classList.remove('saving'); btn.innerHTML='<i class="fa-solid fa-floppy-disk"></i> Save Changes'; } }
    },
    savePaymentSettings: async () => {
        const method=document.getElementById('set-pay-method').value; const name=document.getElementById('set-pay-name').value;
        if(!method) return window.ui.toast("Add Number");
        try{ await updateDoc(doc(dbService,"users",window.db.user_uid),{paymentMethod:method,paymentName:name}); window.ui.toast("Saved"); window.ui.closeModal(); }
        catch(e){ window.ui.toast("Error Saving"); }
    },
});
