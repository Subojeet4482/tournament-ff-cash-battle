/**
 * Withdrawal: method/coin/network selection, bank + crypto withdraw, success popup.
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
            set('wd-success-method', opts.method === 'CRYPTO' ? 'Crypto wallet' : 'Bank transfer');
            set('wd-success-ref', opts.ref || '--');
            const now = new Date();
            const eta = new Date(now.getTime() + 3*24*60*60*1000); // ~3 working days
            const f = d => d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
            set('wd-success-date', f(now));
            set('wd-success-eta', `${f(now)} - ${f(eta)}`);
            set('wd-success-msg', M.withdraw.popupBody(amt, net, { method: opts.method }));
            set('wd-success-foot', M.withdraw.popupFoot());
            window.ui.openModal('modal-wd-success');
            const v=parseInt(localStorage.getItem('vol_withdrawal')||'80');
            const we=document.getElementById('audio-withdrawal');
            if(we && v>0){ we.volume=v/100; we.currentTime=0; we.play().catch(()=>{}); }
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
    selectCoin: (coin) => {
        window.app.selectedCoin = coin;
        ['btc','usdt','ltc'].forEach(c=>{const el=document.getElementById('cn-'+c); if(el) el.classList.remove('selected');});
        document.getElementById('cn-'+coin.toLowerCase()).classList.add('selected');
    },
    selectNetwork: (net) => {
        window.app.selectedNetwork = net;
        ['main','trc20','bep20'].forEach(n=>document.getElementById('cnw-'+n).classList.remove('selected'));
        const map = {'Mainnet':'main','TRC20':'trc20','BEP20':'bep20'};
        document.getElementById('cnw-'+map[net]).classList.add('selected');
    },
    updateBankNet: (val) => {
        const amt = parseFloat(val)||0;
        const el = document.getElementById('wd-bank-net');
        const netEl = document.getElementById('wd-bank-net-val');
        if(amt >= 20){ el.style.display='block'; netEl.innerText=(amt-2).toFixed(2); }
        else { el.style.display='none'; }
    },
    updateCryptoNet: (val) => {
        const amt = parseFloat(val)||0;
        const el = document.getElementById('wd-crypto-net');
        const netEl = document.getElementById('wd-crypto-net-val');
        if(amt >= 20){ el.style.display='block'; netEl.innerText=(amt-2).toFixed(2); }
        else { el.style.display='none'; }
    },
    // ===== BANK FORM HELPERS (live formatting + validation) =====
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
    withdrawBank: async () => {
        const name=document.getElementById('wd-bank-name').value.trim();
        const acc=document.getElementById('wd-bank-account').value.trim();
        const ifsc=document.getElementById('wd-bank-ifsc').value.trim().toUpperCase();
        const amt=parseFloat(document.getElementById('wd-bank-amount').value);
        if(!name||!acc||!ifsc||!amt) return window.ui.toast(window.msg.withdraw.fillAll());
        if(name.length<3) return window.ui.toast(window.msg.withdraw.shortName());
        if(!/^\d{9,18}$/.test(acc)) return window.ui.toast(window.msg.withdraw.badAccount());
        if(!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return window.ui.toast(window.msg.withdraw.badIfsc());
        if(parseFloat(amt)<20) return window.ui.toast(window.msg.withdraw.minAmount());
        if(amt>window.db.withdrawBalance) return window.ui.toast(window.msg.withdraw.insufficient(window.db.withdrawBalance));
        if(!window.app.rateLimit('withdraw',60000)) return;
        const btn=document.querySelector('#modal-withdraw .btn-main[onclick*="withdrawBank"]'); if(btn) btn.disabled=true;
        window.ui.toast(window.msg.withdraw.processing());
        try {
            // Re-fetch latest balance before debit to prevent over-withdraw via rapid clicks
            const snap = await getDoc(doc(dbService,"users",window.db.user_uid));
            const cur = snap.data()||{}; const curWd = cur.withdrawBalance||0;
            if(amt>curWd) { window.app.endAction('withdraw',false); if(btn) btn.disabled=false; return window.ui.toast(window.msg.withdraw.insufficient(curWd)); }
            const maskedAcc = acc.length>=4 ? acc.slice(0,2)+'x'.repeat(Math.max(acc.length-4,2))+acc.slice(-2) : acc;
            // ATOMIC: balance debit + withdrawal request in a single commit
            const _wb=writeBatch(dbService);
            _wb.update(doc(dbService,"users",window.db.user_uid),{withdrawBalance:curWd-amt});
            const _ref=doc(collection(dbService,"users",window.db.user_uid,"transactions"));
            _wb.set(_ref,{
                title:window.msg.withdraw.title(amt,`A/c ${maskedAcc}`),
                amount:`-₹${amt}`, net:`₹${(amt-2).toFixed(2)}`,
                type:"withdraw", status:"pending", method:"BANK", balanceType:"withdraw",
                accountName:name, accountNumber:acc, ifsc,
                date:new Date().toLocaleDateString(), createdAt:Date.now(), timestamp:serverTimestamp()
            });
            await _wb.commit();
            window.app.showWithdrawSuccess(amt,{method:'BANK',net:amt-2,ref:_ref.id.slice(0,8).toUpperCase()});
            window.app.endAction('withdraw',true);
            window.app.fetchUserData(); window.app.fetchTransactions();
        } catch(e){ window.app.endAction('withdraw',false); window.ui.toast("Error: "+e.message); }
        finally { if(btn) btn.disabled=false; }
    },
    withdrawCrypto: async () => {
        const addr=document.getElementById('wd-crypto-addr').value.trim();
        const network=document.getElementById('wd-crypto-network').value.trim();
        const amt=parseFloat(document.getElementById('wd-crypto-amount').value);
        if(!addr||!network||!amt) return window.ui.toast(window.msg.withdraw.fillAll());
        if(amt<20) return window.ui.toast(window.msg.withdraw.minAmount());
        if(amt>window.db.withdrawBalance) return window.ui.toast(window.msg.withdraw.insufficient(window.db.withdrawBalance));
        if(!window.app.rateLimit('withdraw',60000)) return;
        const btn=document.querySelector('#modal-withdraw .btn-main[onclick*="withdrawCrypto"]'); if(btn) btn.disabled=true;
        window.ui.toast(window.msg.withdraw.processing());
        try {
            const snap = await getDoc(doc(dbService,"users",window.db.user_uid));
            const cur = snap.data()||{}; const curWd = cur.withdrawBalance||0;
            if(amt>curWd) { window.app.endAction('withdraw',false); if(btn) btn.disabled=false; return window.ui.toast(window.msg.withdraw.insufficient(curWd)); }
            const maskedAddr = addr.length>=8 ? addr.slice(0,4)+'x'.repeat(4)+addr.slice(-4) : addr;
            // ATOMIC: balance debit + withdrawal request in a single commit
            const _wb=writeBatch(dbService);
            _wb.update(doc(dbService,"users",window.db.user_uid),{withdrawBalance:curWd-amt});
            const _ref=doc(collection(dbService,"users",window.db.user_uid,"transactions"));
            _wb.set(_ref,{
                title:window.msg.withdraw.title(amt,`${window.app.selectedCoin||'Crypto'} ${maskedAddr}`),
                amount:`-₹${amt}`, net:`₹${(amt-2).toFixed(2)}`,
                type:"withdraw", status:"pending", method:"CRYPTO", balanceType:"withdraw",
                coin:window.app.selectedCoin, network:network,
                walletAddress:addr,
                date:new Date().toLocaleDateString(), createdAt:Date.now(), timestamp:serverTimestamp()
            });
            await _wb.commit();
            window.app.showWithdrawSuccess(amt,{method:'CRYPTO',net:amt-2,ref:_ref.id.slice(0,8).toUpperCase()});
            window.app.endAction('withdraw',true);
            window.app.fetchUserData(); window.app.fetchTransactions();
        } catch(e){ window.app.endAction('withdraw',false); window.ui.toast("Error: "+e.message); }
        finally { if(btn) btn.disabled=false; }
    },
});
