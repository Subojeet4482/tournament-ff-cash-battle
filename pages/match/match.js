/**
 * My Matches page.
 */
Object.assign(window.app, {
    renderMyMatches: () => {
        const c=document.getElementById('my-matches-list'); c.innerHTML="";
        const tab=window.app.activeTab||'join';
        let data=tab==='history'
            ? window.db.matches.filter(m=>window.db.joined_ids.includes(m.id)&&m.status==='completed')
            : window.db.matches.filter(m=>window.db.joined_ids.includes(m.id)&&m.status!=='completed');
        if(data.length===0){ c.innerHTML=`<div style="text-align:center; padding:50px 20px; opacity:0.6;"><i class="fa-solid fa-ghost" style="font-size:3rem;"></i><p>No matches found</p></div>`; return; }
        const myUid=window.db.user_uid;
        data.forEach(m=>{
            const img=m.img||"https://placehold.co/100x100/1e293b/FFF?text=Game"; const isCompleted=m.status==='completed';
            // Find my participation entry
            const me=(m.participants||[]).find(p=>p.uid===myUid)||{};
            const slot=me.slot||(me.slots&&me.slots[0])||'-';
            const ffName=me.gameName||'-'; const ffUid=me.gameUid||'-';
            const myKills=me.kills!==undefined?me.kills:(isCompleted?0:'-');
            const iWon = isCompleted && (m.winnerUid===myUid);
            const myWin = me.winAmount!==undefined ? me.winAmount : (isCompleted?(iWon?m.prize:0):'-');
            const prizeLbl=m.matchType==='per_kill'?'Per Kill':'Win Prize';
            // Kills / Won inline cell rules:
            // - finished + won  -> green "WIN" only
            // - finished + kills>0 -> "<n> Kills"
            // - finished + 0 kills -> "0 Kill / ₹0"
            // - not finished -> kills only ("-" placeholder)
            let kwHtml;
            if(!isCompleted){
                kwHtml = `<div class="stat-val text-primary">${myKills}</div><div class="stat-lbl">Kills</div>`;
            } else if(iWon){
                kwHtml = `<div class="stat-val" style="color:#16a34a; font-weight:800;">WIN</div><div class="stat-lbl">Result</div>`;
            } else if((Number(myKills)||0) > 0){
                kwHtml = `<div class="stat-val text-primary">${myKills}</div><div class="stat-lbl">Total Kills</div>`;
            } else {
                kwHtml = `<div class="stat-val" style="color:#64748b;">0 Kill</div><div class="stat-lbl">₹0</div>`;
            }
            const detailsBox=`<div class="card-stats-grid" style="margin:12px 15px 0;">
                <div><div class="stat-val text-primary">#${slot}</div><div class="stat-lbl">Slot</div></div>
                <div><div class="stat-val">₹${m.fee}</div><div class="stat-lbl">Entry Fee</div></div>
                <div><div class="stat-val">₹${m.prize}</div><div class="stat-lbl">${prizeLbl}</div></div>
            </div>
            <div class="card-stats-grid" style="margin:8px 15px 0;">
                <div><div class="stat-val" style="font-size:0.85rem; word-break:break-all;">${ffName}</div><div class="stat-lbl">FF Name</div></div>
                <div><div class="stat-val" style="font-size:0.85rem;">${ffUid}</div><div class="stat-lbl">FF UID</div></div>
                <div>${kwHtml}</div>
            </div>`;
            let bodyContent=isCompleted
                ? (iWon
                    ? `<div class="result-box" style="margin:12px 15px 15px;"><div class="winner-trophy"><i class="fa-solid fa-trophy"></i></div><div class="text-muted" style="font-size:0.8rem">WINNER</div><div class="winner-name">${m.winnerName||window.db.user_name||'You'}</div><div class="prize-won" style="color:#16a34a; font-weight:800; font-size:1.1rem;">+₹${myWin||m.prize}</div><div style="margin-top:6px; display:inline-block; padding:4px 12px; border-radius:999px; background:#dcfce7; color:#16a34a; font-weight:800; font-size:0.78rem;"><i class="fa-solid fa-circle-check"></i> Success</div></div>`
                    : `<div class="result-box" style="margin:12px 15px 15px; background:#fff7ed; border:1px solid #fed7aa;"><div style="font-size:1.8rem; color:#f59e0b; margin-bottom:4px;"><i class="fa-solid fa-face-sad-tear"></i></div><div style="font-weight:800; color:#9a3412;">Battle Luck Next Time</div><div class="text-muted" style="font-size:0.78rem; margin-top:4px;">Match khatam — agle match me try karo 💪</div></div>`)
                : (m.roomId&&m.roomPass
                    ? `<div class="room-box"><div class="text-success bold" style="margin-bottom:10px; font-size:0.8rem;"><i class="fa-solid fa-unlock"></i> Room Credentials</div><div class="room-creds"><div class="cred-item" onclick="window.ui.copy('${m.roomId}')"><span class="cred-label">Room ID</span><span class="cred-val">${m.roomId}</span><span class="btn-copy">COPY</span></div><div class="cred-item" onclick="window.ui.copy('${m.roomPass}')"><span class="cred-label">Password</span><span class="cred-val">${m.roomPass}</span><span class="btn-copy">COPY</span></div></div></div>`
                    : `<div class="room-box"><div class="room-wait"><i class="fa-solid fa-lock" style="font-size:1.5rem; color:#cbd5e1;"></i><span>ID & Pass will appear here 10 mins before match.</span></div></div>`);
            // Joined indicator block (shown under header) + room creds also surface below the JOINED badge
            const joinedBlock = !isCompleted
                ? `<div style="margin:12px 15px 0; padding:10px 14px; background:#dcfce7; border:1px solid #86efac; border-radius:12px; display:flex; align-items:center; justify-content:space-between; font-weight:800; color:#15803d;"><span><i class="fa-solid fa-circle-check"></i> Joined — Slot #${slot}</span></div>`
                : '';
            c.innerHTML+=`<div class="mm-card"><div class="mm-header"><div class="mm-game-info"><img src="${img}" class="mm-thumb"><div class="mm-meta"><h4>${m.title}</h4><div class="text-muted" style="font-size:0.75rem">${m.time||'Upcoming'}</div></div></div><span class="mm-status ${isCompleted?'st-completed':'st-upcoming'}">${isCompleted?'FINISHED':'JOINED'}</span></div>${joinedBlock}${detailsBox}${bodyContent}</div>`;
        });
    },
    activeTab: 'join',
    switchTab: (t,e) => { window.app.activeTab=t; document.querySelectorAll('#page-matches .mm-tab').forEach(x=>x.classList.remove('active')); if(e) e.classList.add('active'); window.app.renderMyMatches(); },
});
