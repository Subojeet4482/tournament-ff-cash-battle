/**
 * UI helpers: drawer, modals (open/close + per-modal prefill), toast, copy.
 */
window.ui = {
    toggleDrawer: (skipHistory=false) => {
        const el=document.getElementById('drawer-wrapper'); const isActive=el.classList.contains('drawer-active');
        if(!isActive&&!skipHistory) history.pushState({drawer:true},null,'#menu');
        else if(isActive&&!skipHistory){ history.back(); return; }
        el.classList.toggle('drawer-active');
        if(el.classList.contains('drawer-active')) window.ui.drawerCount();
    },
    // Numbers in the drawer count up from 0 every time it opens
    countUp: (el, dur=700) => {
        if(!el) return; const txt=el.dataset.cu||el.innerText; el.dataset.cu=txt; const to=parseFloat(txt); if(isNaN(to)) return;
        const dec=(txt.split('.')[1]||'').length; const t0=performance.now();
        const step=(t)=>{ const p=Math.min(1,(t-t0)/dur); const e=1-Math.pow(1-p,3); el.innerText=(to*e).toFixed(dec); if(p<1) requestAnimationFrame(step); else { el.innerText=to.toFixed(dec); delete el.dataset.cu; } };
        el.innerText=(0).toFixed(dec); requestAnimationFrame(step);
    },
    drawerCount: () => { ['stat-played','stat-won','stat-earned','drawer-bal'].forEach(id=>window.ui.countUp(document.getElementById(id))); },
    openModal: (id) => {
        const d=window.db.user_data;
        if(id==='modal-edit-profile'){
            document.getElementById('edit-app-name').value=d.appName||""; document.getElementById('edit-game-name').value=d.gameName||""; document.getElementById('edit-game-uid').value=d.gameUid||""; document.getElementById('edit-profile-img').src=window.app.avatarUrl(d); window.app.tempImage=null;
            const pidEl=document.getElementById('edit-player-id'); if(pidEl) pidEl.innerText=d.playerId||(window.db.user_uid||'').slice(0,7);
            const cnt=document.getElementById('ep-name-count'); if(cnt) cnt.innerText=(d.appName||'').length+'/24';
            const uidInput=document.getElementById('edit-game-uid'); const uidStatus=document.getElementById('uid-status-icon');
            if(d.isUidVerified){ uidInput.disabled=true; uidStatus.innerHTML='<span style="color:var(--success); font-size:0.8rem;"><i class="fa-solid fa-circle-check"></i> Verified</span>'; }
            else { uidInput.disabled=false; uidStatus.innerHTML=''; }
            const left=d.nameChangesLeft!==undefined?d.nameChangesLeft:2; document.getElementById('changes-left-count').innerText=left; document.getElementById('edit-app-name').disabled=(left<=0); const sv=document.getElementById('ep-save'); if(sv){ sv.disabled=false; sv.innerHTML='<i class="fa-solid fa-floppy-disk"></i> Save Changes'; }
        }
        if(id==='modal-settings'){ document.getElementById('set-pay-method').value=d.paymentMethod||""; document.getElementById('set-pay-name').value=d.paymentName||""; if(typeof window.app.renderSupportContacts==='function') window.app.renderSupportContacts(); }
        if(id==='modal-sound'){
            const va=parseInt(localStorage.getItem('vol_app')||'50');
            document.getElementById('sound-app').value=va; document.getElementById('sound-app-val').innerText=va+'%';
            const vt=parseInt(localStorage.getItem('vol_touch')||'50');
            document.getElementById('sound-touch').value=vt; document.getElementById('sound-touch-val').innerText=vt+'%';
            const vw=parseInt(localStorage.getItem('vol_withdrawal')||'80');
            document.getElementById('sound-withdrawal').value=vw; document.getElementById('sound-withdrawal-val').innerText=vw+'%';
            const vn=parseInt(localStorage.getItem('vol_notification')||'80');
            document.getElementById('sound-notification').value=vn; document.getElementById('sound-notification-val').innerText=vn+'%';
            const vs=parseInt(localStorage.getItem('vol_settings')||'80');
            document.getElementById('sound-settings').value=vs; document.getElementById('sound-settings-val').innerText=vs+'%';
            const vc=parseInt(localStorage.getItem('vol_clear')||'80');
            document.getElementById('sound-clear').value=vc; document.getElementById('sound-clear-val').innerText=vc+'%';
        }
        if(id==='modal-transfer'){
            document.querySelectorAll('.live-balance').forEach(el=>el.innerText=window.db.depositBalance.toFixed(2));
        }
        if(id==='modal-withdraw'){
            // Withdraw only from withdrawal balance
            document.querySelectorAll('.live-balance').forEach(el=>el.innerText=window.db.withdrawBalance.toFixed(2));
            // Reset
            document.querySelectorAll('.wd-method-card').forEach(c=>c.classList.remove('selected'));
            document.querySelectorAll('.wd-section').forEach(s=>s.classList.remove('active'));
            window.app.selectedWdMethod=null;
        }

        history.pushState({modal:id},null,'#'+id); document.getElementById(id).classList.add('active');
    },
    closeModal: (skipHistory=false) => {
        const active=document.querySelector('.modal-wrap.active');
        if(active){ active.classList.remove('active'); if(!skipHistory) history.back(); }
    },
    toast: (m) => { const t=document.getElementById('toast'); document.getElementById('toast-msg').innerText=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); },
    copy: (t) => { navigator.clipboard.writeText(t); window.ui.toast('Copied!'); }
};
