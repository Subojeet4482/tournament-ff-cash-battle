/**
 * Home page: categories + match list.
 */
import { collection, getDocs, query, dbService } from '../../js/core/firebase.js';

Object.assign(window.app, {
    // ===== Home banner slider: swipe / drag, arrows, dots, autoplay =====
    initBanner: (banners) => {
        const $=(id)=>document.getElementById(id);
        const box=$('home-banner-container'), track=$('home-banner-track'), dots=$('home-banner-dots'), cnt=$('home-banner-count');
        if(!box||!track) return;
        if(window._bannerCleanup) window._bannerCleanup();
        const esc=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const list=(banners&&banners.length)?banners:[null], n=list.length;
        track.innerHTML=list.map((u,i)=>u
            ? `<div class="hb-slide"><img src="${esc(u)}" alt="Banner ${i+1}" draggable="false" ${i?'loading="lazy"':''} onerror="this.closest('.hb-slide').classList.add('hb-err')"></div>`
            : `<div class="hb-slide hb-default"><div class="hb-def-in"><i class="fa-solid fa-gamepad"></i><b>FF Cash Battle</b><span>Join &bull; Play &bull; Win Real Cash</span></div></div>`).join('');
        dots.innerHTML=n>1?list.map((_,i)=>`<button type="button" class="hb-dot" aria-label="Slide ${i+1}" data-i="${i}"></button>`).join(''):'';
        box.querySelectorAll('.hb-arrow').forEach(b=>b.classList.toggle('hidden',n<2));
        cnt.classList.toggle('hidden',n<2);
        let idx=0, timer=null, startX=0, startY=0, dx=0, down=false, moved=false, w=1;
        const slides=()=>track.children;
        const render=()=>{
            track.style.transform=`translate3d(${-idx*100}%,0,0)`;
            Array.from(slides()).forEach((s,i)=>s.classList.toggle('active',i===idx));
            Array.from(dots.children).forEach((d,i)=>d.classList.toggle('active',i===idx));
            cnt.textContent=(idx+1)+'/'+n;
        };
        const go=(i)=>{ idx=Math.max(0,Math.min(n-1,i)); track.classList.remove('dragging'); render(); restart(); };
        window.app.bannerGo=(step)=>go(((idx+step)%n+n)%n);
        const stop=()=>{ clearInterval(timer); timer=null; };
        const restart=()=>{ stop(); if(n>1&&!document.hidden) timer=setInterval(()=>{ if(!down) go((idx+1)%n); },4500); };
        const onDown=(e)=>{ if(n<2||(e.button!==undefined&&e.button!==0)||e.target.closest('.hb-arrow,.hb-dot')) return; down=true; moved=false; dx=0; startX=e.clientX; startY=e.clientY; w=box.offsetWidth||1; stop(); };
        const onMove=(e)=>{
            if(!down) return;
            dx=e.clientX-startX;
            if(!moved){ if(Math.abs(dx)<6) return; if(Math.abs(e.clientY-startY)>Math.abs(dx)){ down=false; restart(); return; } moved=true; track.classList.add('dragging'); try{box.setPointerCapture(e.pointerId);}catch(_){} }
            let off=dx; if((idx===0&&dx>0)||(idx===n-1&&dx<0)) off=dx*0.35; // edge rubber-band
            track.style.transform=`translate3d(calc(${-idx*100}% + ${off}px),0,0)`;
        };
        const onUp=()=>{
            if(!down) return; down=false;
            if(moved){ const t=w*0.18; go(dx<-t?idx+1:dx>t?idx-1:idx); } else restart();
        };
        box.addEventListener('pointerdown',onDown); box.addEventListener('pointermove',onMove);
        box.addEventListener('pointerup',onUp); box.addEventListener('pointercancel',onUp); box.addEventListener('pointerleave',()=>{ if(down&&!moved){ down=false; restart(); } });
        dots.onclick=(e)=>{ const b=e.target.closest('.hb-dot'); if(b) go(+b.dataset.i); };
        const vis=()=>{ document.hidden?stop():restart(); }; document.addEventListener('visibilitychange',vis);
        window._bannerCleanup=()=>{ stop(); document.removeEventListener('visibilitychange',vis); box.removeEventListener('pointerdown',onDown); box.removeEventListener('pointermove',onMove); box.removeEventListener('pointerup',onUp); box.removeEventListener('pointercancel',onUp); };
        render(); restart();
    },
    fetchCategories: async () => {
        const container=document.getElementById('category-filters');
        try {
            const snap=await getDocs(collection(dbService,"categories")); let cats=["All"];
            snap.forEach(d=>cats.push(d.data().name));
            if(cats.length===1) cats=["All","CS-Ranked","Battle Royale","Ludo"];
            container.innerHTML="";
            cats.forEach((cat,i)=>{ container.innerHTML+=`<div class="${i===0?'filter-chip active':'filter-chip'}" onclick="window.app.filterCategory('${cat}',this)">${cat}</div>`; });
        } catch(e){}
    },
    filterCategory: (cat,el) => { document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active')); el.classList.add('active'); window.app.selectedCategory=cat; window.app.renderMatches(); },
    fetchMatches: async () => {
        try {
            const q=query(collection(dbService,"matches")); const snap=await getDocs(q); window.db.matches=[];
            snap.forEach(d=>window.db.matches.push({id:d.id,...d.data()}));
            window.db.matches.sort((a,b)=>{ const tA=a.startTime?(a.startTime.seconds?a.startTime.seconds*1000:new Date(a.startTime).getTime()):0; const tB=b.startTime?(b.startTime.seconds?b.startTime.seconds*1000:new Date(b.startTime).getTime()):0; return tA-tB; });
        } catch(e){}
    },
    renderMatches: () => {
        const c=document.getElementById('matches-container'); let data=window.db.matches;
        if(window.app.selectedCategory!=='All') data=data.filter(m=>m.type===window.app.selectedCategory);
        if(data.length===0){ c.innerHTML="<div style='text-align:center; padding:30px; opacity:0.5'>No Matches Found</div>"; return; }
        c.innerHTML="";
        data.forEach(m=>{
            const p=(m.joined/m.total)*100; const full=m.joined>=m.total; const joined=window.db.joined_ids.includes(m.id);
            const img=m.img||"https://placehold.co/600x300/1e293b/FFF?text=FF+Match";
            let targetMs=0, timeDisplay="TBD";
            if(m.startTime){ targetMs=m.startTime.seconds?m.startTime.seconds*1000:new Date(m.startTime).getTime(); timeDisplay=`<span class="countdown-timer" data-target="${targetMs}">Loading...</span>`; }
            let btnAction=joined?"":(full?"":`window.app.checkLogin(() => window.app.openJoin('${m.id}'))`);
            const mtLabel=m.matchType==='per_kill'?'🎯 Per Kill':m.matchType==='team_win'?'👥 '+m.teamMode:'🏆 Win Prize';
            const prizeLbl = m.matchType==='per_kill' ? 'Per Kill' : 'Win Prize';
            // Password lock: admin-set password hides join, shows "match start try next match"
            const locked = !joined && !!(m.password && String(m.password).trim());
            const btnStyle = (full||joined||locked)?'background:#e2e8f0; color:#64748b; box-shadow:none;':'';
            const btnLabel = joined?'JOINED ✅':locked?'<i class="fa-solid fa-lock"></i> MATCH STARTED — TRY NEXT MATCH':full?'FULL':'JOIN NOW';
            const btnClick = locked?'':btnAction;
            const btnDisabled = locked?'disabled':'';
            c.innerHTML+=`<div class="match-card"><div class="match-banner"><img src="${img}"><div class="card-badge badge-live">LIVE</div><div class="card-badge badge-type">${mtLabel} • ${m.map||'Bermuda'}</div><div class="match-info-overlay"><div class="match-title">${m.title}</div><div class="match-meta">${timeDisplay}</div></div></div><div class="match-body"><div class="card-stats-grid"><div><div class="stat-val text-primary">₹${m.prize}</div><div class="stat-lbl">${prizeLbl}</div></div><div><div class="stat-val">₹${m.fee}</div><div class="stat-lbl">Fee</div></div><div><div class="stat-val">${m.total}</div><div class="stat-lbl">Slots</div></div></div><div class="progress-area"><div class="progress-bar"><div class="progress-fill" style="width:${p}%"></div></div><div class="prog-text"><span>${m.joined}/${m.total} Joined</span><span>${m.total-m.joined} Left</span></div></div><button class="btn-main" ${btnDisabled} style="${btnStyle}" onclick="${btnClick}">${btnLabel}</button></div></div>`;
        });
        window.timers.tick();
    },
});
