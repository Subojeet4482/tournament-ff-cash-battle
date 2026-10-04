/**
 * Notifications modal: fetch, clear, claim cash.
 */
import { collection, getDocs, doc, updateDoc, query, orderBy, limit, deleteDoc, dbService } from '../../js/core/firebase.js';

Object.assign(window.app, {
    fetchNotifications: async () => {
        const list=document.getElementById('notif-list-container'); const dot=document.getElementById('notif-dot');
        try {
            const clearedAt=parseInt(localStorage.getItem('notifClearedAt')||'0');
            let items=[];
            const snap=await getDocs(query(collection(dbService,"notifications"),orderBy("timestamp","desc"),limit(15)));
            snap.forEach(d=>{const n=d.data(); const ms=n.timestamp&&n.timestamp.seconds?n.timestamp.seconds*1000:0; items.push({title:n.title,message:n.message,date:n.date,ms});});
            if(window.db.user_uid){
                const psnap=await getDocs(collection(dbService,"users",window.db.user_uid,"notifications"));
                psnap.forEach(d=>{
                    const n=d.data();
                    const ms=n.timestamp&&n.timestamp.seconds?n.timestamp.seconds*1000:0;
                    items.push({
                        id:d.id, title:n.title, message:n.message, date:n.date, ms,
                        claimAmount:n.claimAmount, claimType:n.claimType, claimed:!!n.claimed
                    });
                });
            }
            items=items.filter(n=>n.ms>clearedAt).sort((a,b)=>b.ms-a.ms);
            window.db._notifItems=items;
            if(items.length){
                dot.style.display='block';
                list.innerHTML=items.map(n=>{
                    if(n.claimAmount && n.id){
                        const claimedTxt = n.claimed
                            ? `<button class="claim-btn" disabled><i class="fa-solid fa-check"></i> Claimed</button>`
                            : `<button class="claim-btn" onclick="app.claimCash('${n.id}',${Number(n.claimAmount)},'${n.claimType||'deposit'}',this)"><i class="fa-solid fa-hand-holding-dollar"></i> Claim ₹${Number(n.claimAmount).toFixed(2)}</button>`;
                        return `<div class="claim-card">
                            <div class="notif-title">${n.title}</div>
                            <div class="claim-amt">₹${Number(n.claimAmount).toFixed(2)}</div>
                            <div class="notif-msg" style="margin-bottom:10px;">${n.message||'Tap claim to add this amount to your wallet.'}</div>
                            ${claimedTxt}
                            <div class="notif-date" style="margin-top:8px;">${n.date}</div>
                        </div>`;
                    }
                    return `<div class="notif-card"><div class="notif-title">${n.title}</div><div class="notif-msg">${n.message}</div><div class="notif-date">${n.date}</div></div>`;
                }).join('');
            }
            else { dot.style.display='none'; list.innerHTML="<div style='text-align:center; padding:20px; color:#aaa'>No notifications</div>"; }
        } catch(e){ list.innerHTML="<div style='text-align:center; color:#aaa'>Failed to load</div>"; }
    },
    clearNotifications: async () => {
        if(!confirm('⚠️ Warning: Saari notifications permanently delete ho jayengi. Kya aap sure hain?')) return;
        try { const cv=parseInt(localStorage.getItem('vol_clear')||'80'); const s=document.getElementById('audio-clear'); if(s && cv>0){ s.volume=cv/100; s.currentTime=0; s.play().catch(()=>{}); } } catch(e){}
        localStorage.setItem('notifClearedAt', Date.now().toString());
        // Delete all personal notifications from firestore
        try {
            if(window.db.user_uid){
                const psnap=await getDocs(collection(dbService,"users",window.db.user_uid,"notifications"));
                const dels=[]; psnap.forEach(d=>dels.push(deleteDoc(doc(dbService,"users",window.db.user_uid,"notifications",d.id))));
                await Promise.all(dels);
            }
        } catch(e){ console.error('clear notif', e); }
        document.getElementById('notif-list-container').innerHTML="<div style='text-align:center; padding:20px; color:#aaa'>No notifications</div>";
        document.getElementById('notif-dot').style.display='none';
        window.ui.toast("All notifications deleted");
    },
    openNotifications: () => {
        const bell=document.getElementById('header-bell');
        if(bell){ bell.classList.remove('bell-shake'); void bell.offsetWidth; bell.classList.add('bell-shake'); }
        const v=parseInt(localStorage.getItem('vol_notification')||'80');
        const ne=document.getElementById('audio-notification');
        if(ne && v>0){ ne.volume=v/100; ne.currentTime=0; ne.play().catch(()=>{}); }
        document.getElementById('notif-dot').style.display='none';
        window.app.fetchNotifications();
        window.ui.openModal('modal-notifications');
    },
    claimCash: async (notifId, amount, type, btn) => {
        // SECURITY: user khud apna balance nahi badha sakta. Reward admin direct credit
        // karta hai. Yeh button sirf purani claim-notifications ko "claimed" mark karta hai.
        if(!window.db.user_uid) return window.ui.toast('Please login first');
        if(!notifId) return;
        if(btn){ btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> ...'; }
        try {
            const nref = doc(dbService,"users",window.db.user_uid,"notifications",notifId);
            await updateDoc(nref, { claimed:true, claimedAt: Date.now() });
            window.ui.toast('Reward admin dwara credit kiya jaata hai.');
            window.app.fetchNotifications();
        } catch(e){
            window.ui.toast('Error: '+e.message);
            if(btn){ btn.disabled=false; btn.innerHTML=`<i class="fa-solid fa-hand-holding-dollar"></i> Claim`; }
        }
    },
});
