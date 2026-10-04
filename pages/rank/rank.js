/**
 * Leaderboard page.
 */
import { collection, onSnapshot, dbService } from '../../js/core/firebase.js';

Object.assign(window.app, {
    _lbUnsub: null,
    fetchLeaderboard: async () => {
        // Realtime: show the top 20 live user balances
        try {
            if(window.app._lbUnsub){ try{ window.app._lbUnsub(); }catch(e){} window.app._lbUnsub=null; }
            window.app._lbUnsub = onSnapshot(collection(dbService,"users"), (snap)=>{
                const arr=[];
                snap.forEach(d=>{
                    const x=d.data();
                    // Main balance only = deposit + withdrawal (no totalEarned / legacy)
                    const dep = x.depositBalance!==undefined ? x.depositBalance : (x.balance||0);
                    const wd  = x.withdrawBalance||0;
                    const tot = dep + wd;
                    arr.push({id:d.id,name:x.appName||"User",isVerified:!!x.isVerified,score:tot,kills:x.kills||0,img:x.photoUrl||`https://ui-avatars.com/api/?name=${encodeURIComponent(x.appName||'User')}`,isMe:d.id===window.db.user_uid});
                });
                arr.sort((a,b)=>b.score-a.score);
                window.db.leaderboard=arr.slice(0,50);
                try{ window.app.renderLB(); }catch(e){}
            }, (e)=>console.error('LB live error',e));
        } catch(e){ console.error('LB fetch error',e); }
    },
    renderLB: () => {
        const podium=document.getElementById('lb-podium'); const list=document.getElementById('lb-list'); podium.innerHTML=""; list.innerHTML="";
        if(window.db.leaderboard.length===0){ list.innerHTML="<div style='text-align:center; padding:20px; color:#aaa'>No Data Available</div>"; return; }
        const data=window.db.leaderboard; const top3=data.slice(0,3); const podiumOrder=[];
        if(top3[1]) podiumOrder.push({p:top3[1],r:2}); if(top3[0]) podiumOrder.push({p:top3[0],r:1}); if(top3[2]) podiumOrder.push({p:top3[2],r:3});
        const fmt=n=>Number(n||0).toFixed(2);
        podiumOrder.forEach(item=>{const p=item.p; const rank=item.r; const tick=p.isVerified?' <i class="fa-solid fa-circle-check" style="color:#1d9bf0;font-size:0.75rem;"></i>':''; podium.innerHTML+=`<div class="podium-item podium-${rank}"><div class="crown" style="${rank===1?'':'display:none'}"><i class="fa-solid fa-crown"></i></div><div class="p-img-box"><img src="${p.img}"><div class="p-rank-badge">${rank}</div></div><div style="font-weight:700; margin-top:10px; font-size:0.9rem;">${p.name}${tick}</div><div class="text-primary bold">₹${fmt(p.score)}</div></div>`;});
        data.slice(3).forEach((p,i)=>{ const tick=p.isVerified?' <i class="fa-solid fa-circle-check" style="color:#1d9bf0;font-size:0.78rem;"></i>':''; list.innerHTML+=`<div class="rank-item" ${p.isMe?'style="border:1px solid var(--primary); background:#eef2ff"':''}><div class="r-pos">${i+4}</div><img src="${p.img}" class="r-img"><div style="flex:1"><div style="font-weight:600">${p.name}${tick} ${p.isMe?'(You)':''}</div><div style="font-size:0.75rem; color:#aaa">Main Balance</div></div><div class="r-val">₹${fmt(p.score)}</div></div>`; });
    },
});
