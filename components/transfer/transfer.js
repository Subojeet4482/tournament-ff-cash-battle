/**
 * Transfer money: recipient verify + send.
 */
import { collection, getDocs, query, where, dbService } from '../../js/core/firebase.js';

Object.assign(window.app, {
    verifyRecipient: async (pid) => {
        const statusEl=document.getElementById('recipient-status'); window.app.recipientVerified=false; window.app.recipientUid=null;
        if(pid.length<5){ statusEl.innerHTML=""; return; }
        if(pid===(window.db.user_data.playerId||'')){ statusEl.innerHTML="<span class='text-danger'>Cannot send to self</span>"; return; }
        statusEl.innerHTML="<span class='text-muted'>Searching...</span>";
        try {
            const snap=await getDocs(query(collection(dbService,"users"), where("playerId","==",pid)));
            if(!snap.empty){ const d=snap.docs[0]; statusEl.innerHTML=`<span class="text-success"><i class="fa-solid fa-circle-check"></i> Found: <b>${d.data().appName||"User"}</b></span>`; window.app.recipientVerified=true; window.app.recipientUid=d.id; }
            else { statusEl.innerHTML="<span class='text-danger'>Not found!</span>"; }
        } catch(e){ statusEl.innerHTML="<span class='text-danger'>Error</span>"; }
    },
    transfer: async () => {
        // SECURITY: ek user dusre user ki balance nahi badha sakta (sirf admin).
        // Client-side P2P transfer secure nahi ho sakta, isliye disable hai.
        // (Agar chahiye to admin ya server-side function se karwana hoga.)
        return window.ui.toast("Transfer abhi band hai. Kripya admin se sampark karein.");
        // eslint-disable-next-line no-unreachable
        try {
            const targetUid=window.app.recipientUid; const amount=parseFloat(document.getElementById('tr-amount').value);
            const note=document.getElementById('tr-note').value.trim(); const pass=document.getElementById('tr-pass').value;
            if(!targetUid||!amount||!pass) return window.ui.toast("Fill all fields");
        } catch(e){ window.ui.toast("Failed: "+e.message); }

    },
});
