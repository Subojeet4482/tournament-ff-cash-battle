/**
 * Withdrawal: UPI + Bank (details can be saved in this browser), coin animation, success popup.
 */
import { collection, doc, getDoc, writeBatch, serverTimestamp, dbService } from '../../js/core/firebase.js';

Object.assign(window.app, {
    // ===== WITHDRAWAL SUCCESS MODAL =====
    showWithdrawSuccess: (amount, opts) => {
        try {
            opts = opts || {};
            const M = window.msg, amt = Number(amount), net = opts.net != null ? opts.net : Math.max(0, amt - 2);
            window.ui.closeModal();
            let name = (window.db.user_data && (window.db.user_data.appName||window.db.user_name)) || 'Player';
            // Force English-only display (strip non-ASCII characters from the user's name)
            name = String(name).replace(/[^\x20-\x7E]/g,'').trim() || 'Player';
            const set = (id, v) => { const el=document.getElementById(id); if(el) el.innerText=v; };
            set('wd-success-title', M.withdraw.popupTitle());
            set('wd-success-hello', `Hi ${name}, you're all set!`);
            set('wd-success-amt', amt.toFixed(2));
            set('wd-success-net', net.toFixed(2));
            set('wd-success-method', opts.method === 'UPI' ? 'UPI' : 'Bank transfer');
            set('wd-success-ref', opts.ref || '--');
            const now = new Date();
            const eta = new Date(now.getTime() + 3*24*60*60*1000); // ~3 working days
            const f = d => d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
            set('wd-success-date', f(now));
            set('wd-success-eta', `${f(now)} - ${f(eta)}`);
            set('wd-success-msg', M.withdraw.popupBody(amt, net, { method: opts.method }));
            set('wd-success-foot', M.withdraw.popupFoot());
            window.ui.openModal('modal-wd-success');
            // Auto-close after 8 seconds (more text to read now)
            if(window._wdSuccessTimer) clearTimeout(window._wdSuccessTimer);
            window._wdSuccessTimer = setTimeout(()=>{
                const m=document.getElementById('modal-wd-success');
                if(m && m.classList.contains('active')){ try{ window.ui.closeModal(); }catch(e){} }
            }, 8000);
        } catch(e){ window.ui.toast(window.msg.withdraw.toastFallback()); }
    },
    // ===== WITHDRAW METHOD SELECT =====
    selectWdMethod: (method) => {
        window.app.selectedWdMethod = method;
        document.querySelectorAll('.wd-method-card').forEach(c=>c.classList.remove('selected'));
        document.querySelectorAll('.wd-section').forEach(s=>s.classList.remove('active'));
        document.getElementById('wd-card-'+method).classList.add('selected');
        document.getElementById('wd-'+method+'-section').classList.add('active');
    },
    updateNet: (kind, val) => {
        const amt = parseFloat(val)||0, el = document.getElementById('wd-'+kind+'-net');
        if(amt >= 20){ el.style.display='block'; document.getElementById('wd-'+kind+'-net-val').innerText=(amt-2).toFixed(2); }
        else el.style.display='none';
    },
    // ===== SAVED DETAILS (kept only in this browser's localStorage, per user) =====
    _wdKey: () => 'ff_wd_' + (window.db.user_uid || 'guest'),
    _wdLoad: () => { try { return JSON.parse(localStorage.getItem(window.app._wdKey()) || '{}') || {}; } catch(e){ return {}; } },
    _wdSave: (o) => { try { localStorage.setItem(window.app._wdKey(), JSON.stringify(o)); } catch(e){} },
    initWithdraw: () => {
        const sv = window.app._wdLoad(), $ = (id)=>document.getElementById(id);
        const mask = (v)=>{ v=String(v||''); return v.length>4 ? v.slice(0,2)+'•'.repeat(Math.max(v.length-4,2))+v.slice(-2) : v; };
        if(sv.upi){
            $('wd-upi-name').value = sv.upi.name||''; $('wd-upi-id').value = sv.upi.id||''; window.app.wdFmtUpi($('wd-upi-id'));
            $('wd-upi-saved-txt').innerText = (sv.upi.name?sv.upi.name+' · ':'')+sv.upi.id; $('wd-upi-saved').style.display='flex';
        } else $('wd-upi-saved').style.display='none';
        if(sv.bank){
            $('wd-bank-name').value = sv.bank.name||''; $('wd-bank-account').value = sv.bank.acc||''; $('wd-bank-ifsc').value = sv.bank.ifsc||'';
            window.app.wdFmtAccount($('wd-bank-account')); window.app.wdFmtIfsc($('wd-bank-ifsc'));
            $('wd-bank-saved-txt').innerText = (sv.bank.name?sv.bank.name+' · ':'')+'A/C '+mask(sv.bank.acc)+' · '+(sv.bank.ifsc||''); $('wd-bank-saved').style.display='flex';
        } else $('wd-bank-saved').style.display='none';
        if(sv.last && document.getElementById('wd-card-'+sv.last)) window.app.selectWdMethod(sv.last);
    },
    removeSavedWd: (kind) => {
        const sv = window.app._wdLoad(); delete sv[kind]; if(sv.last===kind) delete sv.last; window.app._wdSave(sv);
        const $ = (id)=>document.getElementById(id);
        $('wd-'+kind+'-saved').style.display='none';
        if(kind==='upi'){ $('wd-upi-name').value=''; $('wd-upi-id').value=''; window.app.wdFmtUpi($('wd-upi-id')); }
        else { $('wd-bank-name').value=''; $('wd-bank-account').value=''; $('wd-bank-ifsc').value=''; window.app.wdFmtAccount($('wd-bank-account')); window.app.wdFmtIfsc($('wd-bank-ifsc')); }
        window.ui.toast('Saved '+(kind==='upi'?'UPI':'bank')+' details removed from this device.');
    },
    // ===== FORM HELPERS =====
    wdFmtUpi: (el) => {
        el.value = el.value.replace(/\s/g,'').toLowerCase();
        const hint = document.getElementById('wd-upi-hint'), v = el.value;
        el.classList.remove('valid','invalid'); hint.className='wd-hint';
        if(!v){ hint.innerText='Format: name@bank'; }
        else if(/^[a-z0-9.\-_]{2,64}@[a-z][a-z0-9]{1,30}$/.test(v)){ el.classList.add('valid'); hint.classList.add('ok'); hint.innerText='Valid UPI ID'; }
        else { el.classList.add('invalid'); hint.classList.add('err'); hint.innerText='Enter a valid UPI ID, e.g. name@okhdfcbank'; }
    },
    wdFmtAccount: (el) => {
        el.value = el.value.replace(/\D/g,'').slice(0,18);
        const n = el.value.length;
        const hint = document.getElementById('wd-acc-hint');
        document.getElementById('wd-acc-count').innerText = n+'/18';
        el.classList.remove('valid','invalid'); hint.className='wd-hint';
        if(n===0){ hint.innerHTML='Only digits &bull; 9 to 18 numbers'; }
        else if(n<9){ el.classList.add('invalid'); hint.classList.add('err'); hint.innerText=(9-n)+' more digit'+(9-n>1?'s':'')+' needed'; }
        else { el.classList.add('valid'); hint.classList.add('ok'); hint.innerText='Looks good'; }
    },
    wdFmtIfsc: (el) => {
        el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,11);
        const v = el.value, hint = document.getElementById('wd-ifsc-hint');
        document.getElementById('wd-ifsc-count').innerText = v.length+'/11';
        el.classList.remove('valid','invalid'); hint.className='wd-hint';
        if(!v.length){ hint.innerHTML='11 characters &bull; 5th character is always 0'; }
        else if(/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v)){ el.classList.add('valid'); hint.classList.add('ok'); hint.innerText='Valid IFSC'; }
        else if(v.length===11){ el.classList.add('invalid'); hint.classList.add('err'); hint.innerText='Invalid IFSC format (e.g. SBIN0001234)'; }
        else { hint.innerText=(11-v.length)+' more character'+(11-v.length>1?'s':''); }
    },
    // ===== SUBMIT (shared by UPI + Bank) =====
    _submitWithdraw: async (kind, amt, btnId, build) => {
        const A = window.app;
        if(amt<20) return window.ui.toast(window.msg.withdraw.minAmount());
        if(amt>window.db.withdrawBalance) return window.ui.toast(window.msg.withdraw.insufficient(window.db.withdrawBalance));
        if(!A.rateLimit('withdraw',60000)) return;
        const btn=document.getElementById(btnId); if(btn) btn.disabled=true;
        window.ui.toast(window.msg.withdraw.processing());
        try {
            // Re-fetch latest balance before debit to prevent over-withdraw via rapid clicks
            const snap = await getDoc(doc(dbService,"users",window.db.user_uid));
            const cur = snap.data()||{}; const curWd = cur.withdrawBalance||0;
            if(amt>curWd){ A.endAction('withdraw',false); if(btn) btn.disabled=false; return window.ui.toast(window.msg.withdraw.insufficient(curWd)); }
            const curDep = cur.depositBalance!==undefined ? cur.depositBalance : (cur.balance||0);
            const b = build();
            // ATOMIC: balance debit + withdrawal request in a single commit
            const _wb=writeBatch(dbService);
            _wb.update(doc(dbService,"users",window.db.user_uid),{withdrawBalance:curWd-amt});
            const _ref=doc(collection(dbService,"users",window.db.user_uid,"transactions"));
            _wb.set(_ref,{
                title:window.msg.withdraw.title(amt,b.masked),
                amount:`-₹${amt}`, net:`₹${(amt-2).toFixed(2)}`,
                type:"withdraw", status:"pending", method:b.method, balanceType:"withdraw",
                ...b.fields,
                date:new Date().toLocaleDateString(), createdAt:Date.now(), timestamp:serverTimestamp()
            });
            await _wb.commit();
            // remember details on this device (if ticked)
            if(b.save){ const sv=A._wdLoad(); sv[kind]=b.save; sv.last=kind; A._wdSave(sv); }
            window.ui.closeModal();
            A.endAction('withdraw',true);
            A.fetchUserData(); A.fetchTransactions();
            // 3-second coin animation (balance goes down, coin sound) -> success sheet
            await window.walletfx.withdraw(amt, curDep + (curWd-amt));
            A.showWithdrawSuccess(amt,{method:b.method,net:amt-2,ref:_ref.id.slice(0,8).toUpperCase()});
        } catch(e){ A.endAction('withdraw',false); window.ui.toast("Error: "+e.message); }
        finally { if(btn) btn.disabled=false; }
    },
    withdrawUPI: async () => {
        const name=document.getElementById('wd-upi-name').value.trim();
        const upi=document.getElementById('wd-upi-id').value.trim().toLowerCase();
        const amt=parseFloat(document.getElementById('wd-upi-amount').value);
        if(!name||!upi||!amt) return window.ui.toast(window.msg.withdraw.fillAll());
        if(name.length<3) return window.ui.toast(window.msg.withdraw.shortName());
        if(!/^[a-z0-9.\-_]{2,64}@[a-z][a-z0-9]{1,30}$/.test(upi)) return window.ui.toast(window.msg.withdraw.badUpi());
        const keep=document.getElementById('wd-upi-save').checked;
        return window.app._submitWithdraw('upi',amt,'wd-upi-btn',()=>({
            method:'UPI', masked:'UPI '+(upi.length>6?upi.slice(0,2)+'xxxx'+upi.slice(upi.indexOf('@')):upi),
            fields:{accountName:name, upiId:upi}, save: keep ? {name,id:upi} : null
        }));
    },
    withdrawBank: async () => {
        const name=document.getElementById('wd-bank-name').value.trim();
        const acc=document.getElementById('wd-bank-account').value.trim();
        const ifsc=document.getElementById('wd-bank-ifsc').value.trim().toUpperCase();
        const amt=parseFloat(document.getElementById('wd-bank-amount').value);
        if(!name||!acc||!ifsc||!amt) return window.ui.toast(window.msg.withdraw.fillAll());
        if(name.length<3) return window.ui.toast(window.msg.withdraw.shortName());
        if(!/^\d{9,18}$/.test(acc)) return window.ui.toast(window.msg.withdraw.badAccount());
        if(!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return window.ui.toast(window.msg.withdraw.badIfsc());
        const maskedAcc = acc.length>=4 ? acc.slice(0,2)+'x'.repeat(Math.max(acc.length-4,2))+acc.slice(-2) : acc;
        const keep=document.getElementById('wd-bank-save').checked;
        return window.app._submitWithdraw('bank',amt,'wd-bank-btn',()=>({
            method:'BANK', masked:`A/c ${maskedAcc}`,
            fields:{accountName:name, accountNumber:acc, ifsc}, save: keep ? {name,acc,ifsc} : null
        }));
    },
});
