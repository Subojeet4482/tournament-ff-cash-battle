/**
 * Join-match flow: UID check, slot grid, confirm.
 */
import { collection, doc, getDoc, updateDoc, arrayUnion, addDoc, serverTimestamp, runTransaction, writeBatch, increment, dbService } from '../../js/core/firebase.js';

Object.assign(window.app, {
    // Fill the join sheet from a match object (sync, no network)
    _fillJoin: (m) => {
        window.app.currentMatch=m;
        document.getElementById('join-title').innerText=m.title; window.fx.countUp(document.getElementById('join-fee'), parseFloat(m.fee)||0);
        const mt=m.matchType==='per_kill'?'Per Kill':m.matchType==='team_win'?'Team Win':'Win Prize';
        document.getElementById('sum-type').innerText=mt; document.getElementById('sum-map').innerText=m.map||"Bermuda"; document.getElementById('sum-prize').innerText="₹"+m.prize;
        const fee=parseFloat(m.fee); const btn=document.getElementById('btn-pay-join'); const balStatus=document.getElementById('join-bal-status');
        const totalBal = (window.db.depositBalance||0)+(window.db.withdrawBalance||0);
        if(totalBal<fee){ btn.disabled=true; btn.innerText="Insufficient Balance"; balStatus.innerHTML=`₹${totalBal.toFixed(2)} <span class="bal-low">(Low)</span>`; }
        else { btn.disabled=false; btn.innerText="Pay & Join"; balStatus.innerHTML=`₹${totalBal.toFixed(2)} <span class="bal-ok">(OK)</span>`; }
    },
    openJoin: (id) => {
        // Duplicate check - a match can be joined only once
        if((window.db.joined_ids||[]).includes(id)) return window.ui.toast("You have already joined this match.");
        const cached=(window.db.matches||[]).find(x=>x.id===id);
        const open=(m)=>{
            if((m.joined||0)>=(m.total||48)) return window.ui.toast("This match is full. Please try another match.");
            const _fe=document.getElementById('join-fee'); if(_fe) delete _fe.dataset.val;   // fee count-up runs on every open
            window.fx.joinDoneHide();
            document.getElementById('join-steps').dataset.step='1';
            const _s1=document.getElementById('join-step1'); _s1.classList.remove('hidden','join-out');
            document.getElementById('join-step2').classList.add('hidden');
            window.app._fillJoin(m);
            window.app.selectedSlot=null;
            window.ui.openModal('modal-join');
        };
        // FAST PATH: the sheet opens INSTANTLY from the cached match (no network wait)
        if(cached){
            open(cached);
            // Fresh data in the background — close the sheet if the match became full/deleted meanwhile
            getDoc(doc(dbService,"matches",id)).then(fresh=>{
                const current=window.app.currentMatch;
                if(!current || current.id!==id) return;               // the user closed/changed the modal
                if(!fresh.exists()){ window.ui.closeModal(); return window.ui.toast("This match is no longer available."); }
                const m={id:fresh.id, ...fresh.data()};
                const idx=window.db.matches.findIndex(x=>x.id===id); if(idx>=0) window.db.matches[idx]=m;
                const step1=document.getElementById('join-step1');
                if(step1 && !step1.classList.contains('hidden')){     // only while still on the payment step
                    if((m.joined||0)>=(m.total||48)){ window.ui.closeModal(); return window.ui.toast("This match just got full. Please try another match."); }
                    window.app._fillJoin(m);
                }
            }).catch(()=>{});
            return;
        }
        // SLOW PATH (cache empty): fetch once
        getDoc(doc(dbService,"matches",id)).then(fresh=>{
            if(!fresh.exists()) return window.ui.toast("This match is no longer available.");
            const m={id:fresh.id, ...fresh.data()};
            (window.db.matches=window.db.matches||[]).push(m);
            open(m);
        }).catch(()=>window.ui.toast("Network error. Please check your internet connection and try again."));
    },
    confirmJoin: async () => {
        const match=window.app.currentMatch; const fee=parseFloat(match.fee);
        const gameName=document.getElementById('game-name').value.trim();
        const gameUid=document.getElementById('game-uid').value.trim();
        const checkbox=document.getElementById('join-terms');
        const uidErr=document.getElementById('uid-error');
        const totalBal=(window.db.depositBalance||0)+(window.db.withdrawBalance||0);
        if((window.db.joined_ids||[]).includes(match.id)) return window.ui.toast("Already joined!");
        if(gameName.length<3) return window.ui.toast("Name too short!");
        // FF UID 6-12 digits
        if(isNaN(gameUid) || gameUid.length<6 || gameUid.length>12){ uidErr.style.display='block'; return window.ui.toast("FF UID invalid (6-12 digits)"); }
        uidErr.style.display='none';
        if(!checkbox.checked) return window.ui.toast("Agree to rules!");
        if(totalBal<fee) return window.ui.toast("Insufficient Balance!");
        if(!window.app.rateLimit('join_'+match.id,60000)) return;
        const btn=document.getElementById('btn-pay-join'); btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
        try {
            // Re-fetch latest balance to prevent rapid-click over-spend
            const snap=await getDoc(doc(dbService,"users",window.db.user_uid));
            const cur=snap.data()||{};
            const dep=cur.depositBalance!==undefined?cur.depositBalance:(cur.balance||0);
            const wd=cur.withdrawBalance||0;
            if((cur.joined_matches||[]).includes(match.id)){ window.app.endAction('join_'+match.id,false); btn.disabled=false; btn.innerText="Pay & Join"; return window.ui.toast("Already joined!"); }
            if(dep+wd<fee){ window.app.endAction('join_'+match.id,false); btn.disabled=false; btn.innerText="Pay & Join"; return window.ui.toast("Insufficient Balance!"); }
            let payFromDep=Math.min(dep,fee); let payFromWd=fee-payFromDep;
            // ATOMIC: match entry + wallet debit in a single commit (no half-join if it fails midway)
            const _b=writeBatch(dbService);
            _b.update(doc(dbService,"matches",match.id),{joined:increment(1),participants:arrayUnion({uid:window.db.user_uid,appName:cur.appName||window.db.user_name,gameName,gameUid})});
            _b.update(doc(dbService,"users",window.db.user_uid),{depositBalance:dep-payFromDep,withdrawBalance:wd-payFromWd,joined_matches:arrayUnion(match.id),matchesPlayed:(cur.matchesPlayed||0)+1,gameName,gameUid});
            await _b.commit();
            await addDoc(collection(dbService,"users",window.db.user_uid,"transactions"),{title:`Joined ${match.title}`,amount:`-₹${fee}`,type:"game",status:"success",date:new Date().toLocaleDateString(),timestamp:serverTimestamp(),createdAt:Date.now()});
            window.db.joined_ids.push(match.id);
            window.app.endAction('join_'+match.id,true);
            // Success animation -> slide to slot step
            await window.fx.joinDone('Payment Successful', '₹'+fee+' paid • now choose your slot', {hold:900});
            document.getElementById('join-steps').dataset.step='2';
            const _s1=document.getElementById('join-step1'), _s2=document.getElementById('join-step2');
            _s1.classList.add('join-out'); await window.fx.wait(230);
            _s1.classList.add('hidden'); _s1.classList.remove('join-out');
            _s2.classList.remove('hidden'); _s2.classList.remove('join-in'); void _s2.offsetWidth; _s2.classList.add('join-in');
            { const g=document.getElementById('slot-grid'); if(g) g.innerHTML='<div class="slot-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading slots…</div>'; }
            // Fetch the fresh match and render the slot grid — so other players' takenSlots show too
            try {
                const _fresh=await getDoc(doc(dbService,"matches",match.id));
                if(_fresh.exists()){
                    const _fm={id:_fresh.id, ..._fresh.data()};
                    window.app.currentMatch=_fm;
                    window.app.renderSlotGrid(_fm);
                } else { window.app.renderSlotGrid(match); }
            } catch(_e){ window.app.renderSlotGrid(match); }
            await window.app.fetchUserData();
        } catch(e){ window.app.endAction('join_'+match.id,false); btn.disabled=false; btn.innerText="Pay & Join"; window.ui.toast("Error: "+e.message); }
    },
    renderSlotGrid: (match) => {
        const total=match.total||48;
        // Map slot -> occupant name
        const slotMap={};
        (match.participants||[]).forEach(p=>{
            if(p.slot) slotMap[p.slot]=p.appName||p.gameName||'Player';
            if(Array.isArray(p.slots)) p.slots.forEach(s=>{ slotMap[s]=p.appName||p.gameName||'Player'; });
        });
        const myName = window.db.user_data.appName || window.db.user_name || 'You';
        document.getElementById('slot-hint').innerText='Just like a Free Fire custom room — choose one slot box and your name will appear in it';
        const grid=document.getElementById('slot-grid');
        grid.innerHTML='';
        for(let i=1;i<=total;i++){
            const isTaken = !!slotMap[i];
            const occupant = slotMap[i] || '';
            const btn=document.createElement('button');
            btn.dataset.slot=i;
            btn.style.cssText=`display:flex; align-items:center; gap:8px; padding:10px 12px; border-radius:12px; border:1.5px solid ${isTaken?'#e2e8f0':'#cbd5e1'}; background:${isTaken?'#f1f5f9':'#ffffff'}; color:${isTaken?'#94a3b8':'#0f172a'}; font-weight:700; font-size:0.82rem; cursor:${isTaken?'not-allowed':'pointer'}; text-align:left; min-height:48px;`;
            btn.style.animationDelay=Math.min(i*18,380)+'ms';
            btn.innerHTML=`<span style="display:inline-flex; align-items:center; justify-content:center; min-width:28px; height:28px; padding:0 6px; border-radius:8px; background:${isTaken?'#e2e8f0':'var(--primary-light)'}; color:${isTaken?'#94a3b8':'var(--primary)'}; font-size:0.75rem; font-weight:800;">#${i}</span><span class="slot-name" style="flex:1; font-weight:600; font-size:0.8rem; color:${isTaken?'#94a3b8':'#94a3b8'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${isTaken?occupant:'Empty — tap to choose'}</span>`;
            if(!isTaken){
                btn.onclick=()=>window.app.selectSlot(i,1,total,Object.keys(slotMap).map(Number));
            }
            grid.appendChild(btn);
        }
        // store for selectSlot preview
        window.app._myName = myName;
    },
    selectSlot: (slot, size, total, taken) => {
        // Single-slot only (FF custom-room style)
        if(slot>total||taken.includes(slot)){ window.ui.toast(`Slot ${slot} is not available. Please pick another slot.`); return; }
        const slots=[slot];
        window.app.selectedSlot=slots;
        const myName = window.app._myName || window.db.user_data.appName || 'You';
        document.querySelectorAll('#slot-grid button').forEach(btn=>{
            const s=parseInt(btn.dataset.slot);
            const nameSpan = btn.querySelector('.slot-name');
            btn.classList.toggle('picked', s===slot);
            if(s===slot){
                btn.style.background='var(--primary)';
                btn.style.borderColor='var(--primary)';
                btn.style.color='#ffffff';
                if(nameSpan){ nameSpan.innerText=myName+' (You)'; nameSpan.style.color='#ffffff'; }
                const badge=btn.querySelector('span'); if(badge){ badge.style.background='#ffffff'; badge.style.color='var(--primary)'; }
            } else if(!btn.disabled && !taken.includes(s)){
                btn.style.background='#ffffff';
                btn.style.borderColor='#cbd5e1';
                btn.style.color='#0f172a';
                if(nameSpan){ nameSpan.innerText='Empty — tap to choose'; nameSpan.style.color='#94a3b8'; }
                const badge=btn.querySelector('span'); if(badge){ badge.style.background='var(--primary-light)'; badge.style.color='var(--primary)'; }
            }
        });
        const cbtn=document.getElementById('btn-confirm-slot');
        cbtn.disabled=false;
        cbtn.innerText=`Confirm Slot #${slot} & Join`;
    },
    confirmSlot: async () => {
        const match=window.app.currentMatch; const slots=window.app.selectedSlot;
        if(!slots||!slots.length) return window.ui.toast("Please select a slot first.");
        const _btn=document.getElementById('btn-confirm-slot');
        const _oldTxt=_btn?_btn.innerText:'';
        if(_btn){ _btn.disabled=true; _btn.innerText='Confirming...'; }
        const fee=parseFloat(match.fee)||0;
        try {
            // Race-safe slot allocation via transaction
            await runTransaction(dbService, async (tx) => {
                const mRef=doc(dbService,"matches",match.id);
                const mSnap=await tx.get(mRef);
                if(!mSnap.exists()) throw new Error("Match not found");
                const mData=mSnap.data();
                const taken=mData.takenSlots||[];
                const clash=slots.find(s=>taken.includes(s));
                if(clash) throw new Error("SLOT_TAKEN:"+clash);
                const parts=(mData.participants||[]).map(p=>{
                    if(p.uid===window.db.user_uid) return {...p, slot:slots[0], slots};
                    return p;
                });
                tx.update(mRef,{participants:parts, takenSlots:[...taken, ...slots]});
            });
            window.app.fetchMatches();
            await window.fx.joinDone(`Slot #${slots.join(',')} Confirmed!`, 'Good luck for the match 🔥', {confetti:true, hold:1700, keep:true});
            window.ui.closeModal();
            setTimeout(window.fx.joinDoneHide, 600);
            window.ui.toast(`Slot #${slots.join(',')} confirmed! ✅`);
        } catch(e){
            // Someone else took the slot — the user has already joined, just pick another slot (no refund needed)
            if(String(e.message||'').startsWith('SLOT_TAKEN')){
                window.ui.toast("Someone just took this slot. Your entry is safe — please choose another slot.");
                window.app.selectedSlot=null;
                try {
                    const _f=await getDoc(doc(dbService,"matches",match.id));
                    if(_f.exists()){ const _fm={id:_f.id, ..._f.data()}; window.app.currentMatch=_fm; window.app.renderSlotGrid(_fm); }
                } catch(_e){}
                const _cb=document.getElementById('btn-confirm-slot'); if(_cb){ _cb.disabled=true; _cb.innerText='Select a slot'; }
            } else {
                window.ui.toast("Error: "+e.message);
            }
        } finally {
            if(_btn && window.app.selectedSlot){ _btn.disabled=false; _btn.innerText=_oldTxt; }
        }
    },
});
