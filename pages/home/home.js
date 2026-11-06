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
            if(cats.length===1) cats=["All","Battle Royale","Clash Squad","Lone Wolf"];
            container.innerHTML="";
            cats.forEach((cat,i)=>{ container.innerHTML+=`<div class="${i===0?'filter-chip active':'filter-chip'}" onclick="window.app.filterCategory('${cat}',this)">${cat}</div>`; });
        } catch(e){}
    },
    searchQ:'', _searchT:null,
    searchMatches: (v) => { const wasEmpty=!String(window.app.searchQ||'').trim(); window.app.searchQ=v; if(wasEmpty && String(v).trim()){ const pg=document.getElementById('page-home'), bx=document.getElementById('hs-search'); if(pg&&bx){ try{ pg.scrollTo({top:Math.max(0,bx.offsetTop-76),behavior:'smooth'}); }catch(e){ pg.scrollTop=Math.max(0,bx.offsetTop-76);} } } const b=document.getElementById('hs-clear'); if(b) b.classList.toggle('hidden',!String(v).trim()); clearTimeout(window.app._searchT); window.app._searchT=setTimeout(()=>window.app.renderMatches(),180); },
    clearSearch: () => { const i=document.getElementById('match-search'); if(i){ i.value=''; i.focus(); } window.app.searchMatches(''); },
    filterCategory: (cat,el) => { document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active')); el.classList.add('active'); window.app.selectedCategory=cat; window.app.renderMatches(); },
    fetchMatches: async () => {
        try {
            const q=query(collection(dbService,"matches")); const snap=await getDocs(q); window.db.matches=[];
            snap.forEach(d=>window.db.matches.push({id:d.id,...d.data()}));
            window.db.matches.sort((a,b)=>{ const tA=a.startTime?(a.startTime.seconds?a.startTime.seconds*1000:new Date(a.startTime).getTime()):0; const tB=b.startTime?(b.startTime.seconds?b.startTime.seconds*1000:new Date(b.startTime).getTime()):0; return tA-tB; });
        } catch(e){}
    },
    coinHtml: (v) => `<img class="coin-ico xs" src="assets/img/ff-coin.png" alt="" draggable="false">${v}`,
    matchView: 'upcoming',
    setMatchView: (v, el) => {
        window.app.matchView = v;
        document.querySelectorAll('.mv-btn').forEach(b => b.classList.toggle('active', b === el));
        const seg = document.getElementById('mv-seg'); if (seg) seg.dataset.active = v;
        window.app.renderMatches();
    },
    _fmtDT: (v) => { if(!v) return ''; const d = v.seconds ? new Date(v.seconds*1000) : new Date(v); return isNaN(d) ? '' : d.toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); },
    _formatLabel: (m) => m.modeShort ? `${m.modeShort} • ${(m.subMode||'').replace('v',' v ')}` : (m.matchType==='per_kill'?'Per Kill':m.matchType==='team_win'?(m.teamMode||'Team'):'Win Prize'),
    _prizeInfo: (m) => {
        const pm = m.prizeMode || (m.matchType==='per_kill'?'per_kill':'match_win');
        const pr = m.prizes || {};
        if (pm==='per_kill') return { big:window.app.coinHtml(Number(pr[1])||Number(m.prize)||0), lbl:'Per Kill', rows:'' };
        const medals = {1:'🥇',2:'🥈',3:'🥉'};
        const ranks = Object.keys(pr).filter(k=>Number(pr[k])>0);
        const rows = ranks.length>1 ? ranks.map(k=>`<span class="pz-chip">${medals[k]||'🏅'} ${window.app.coinHtml(pr[k])}</span>`).join('') : '';
        return { big:window.app.coinHtml(m.prize||0), lbl: ranks.length>1 ? 'Total Prize' : (pm==='match_win' ? ((m.teamSize||1)>1?'Team Prize':'Match Win') : '1st Prize'), rows };
    },
    // Slot layout strip: BR = filled bar, CS / Lone Wolf = Team A  VS  Team B
    _slotStrip: (m) => {
        const taken = new Set((m.takenSlots||[]).map(Number));
        const size = m.teamSize || 1;
        if (m.mode==='CS' || m.mode==='LW') {
            const side = (from, cls) => `<div class="vs-side ${cls}">${Array.from({length:size},(_,i)=>`<i class="vs-dot ${taken.has(from+i)?'on':''}">${from+i}</i>`).join('')}</div>`;
            return `<div class="vs-strip"><div class="vs-col"><small>TEAM A</small>${side(1,'a')}</div><div class="vs-badge">VS</div><div class="vs-col"><small>TEAM B</small>${side(size+1,'b')}</div></div>`;
        }
        return '';
    },
    _winnersStrip: (m) => {
        const w = m.winners || [];
        if (!w.length && !m.winnerName) return '';
        const medals = {1:'🥇',2:'🥈',3:'🥉'};
        const rows = w.length ? w.map((x,i)=>`<div class="win-row" style="animation-delay:${i*90}ms"><span class="win-medal">${medals[x.rank]||'🏅'}</span><b>${(x.names||[]).join(', ')}</b>${x.amount?`<em>${window.app.coinHtml(x.amount)}</em>`:''}${x.kills?`<small>${x.kills} kills</small>`:''}</div>`).join('')
                         : `<div class="win-row"><span class="win-medal">🏆</span><b>${m.winnerName}</b></div>`;
        return `<div class="win-strip"><div class="win-head"><i class="fa-solid fa-crown"></i> WINNERS</div>${rows}</div>`;
    },
    renderMatches: () => {
        const c=document.getElementById('matches-container'); let data=window.db.matches;
        if(window.app.selectedCategory!=='All') data=data.filter(m=>(m.type||m.modeLabel)===window.app.selectedCategory);
        const view=window.app.matchView||'upcoming';
        data=data.filter(m=> view==='completed' ? m.status==='completed' : m.status!=='completed');
        if(view==='completed') data=[...data].reverse(); else data=[...data].sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0));   // pinned matches on top
        const sq=String(window.app.searchQ||'').trim().toLowerCase().replace(/^#/,'');
        if(sq) data=data.filter(m=>[m.title,m.map,m.type,m.modeLabel,m.mode,m.modeShort,m.subMode,m.teamMode,m.matchCode,String(m.id||'').slice(0,8),m.fee!=null?('fee '+m.fee):'',m.prize!=null?('prize '+m.prize):''].some(x=>String(x==null?'':x).toLowerCase().includes(sq)));
        const meta=document.getElementById('hs-meta');
        if(meta){ meta.classList.toggle('hidden',!sq); if(sq) meta.innerHTML=`<i class="fa-solid fa-crosshairs"></i> ${data.length} match${data.length===1?'':'es'} for <b>${String(window.app.searchQ).trim().replace(/[<>&"']/g,'')}</b>`; }
        if(data.length===0){ const art=window.gameArt.empty(sq?'search':'matches'); c.innerHTML=`<div class="empty-art"><img src="${art}" alt="" draggable="false"><b>${sq?'No match found':view==='completed'?'No completed matches yet':'No matches right now'}</b><span>${sq?'Try a different name, mode, map or match ID.':'New battles are added often — check back soon!'}</span>${sq?'<button type="button" class="btn-main" style="max-width:220px;margin:14px auto 0" onclick="app.clearSearch()">Clear search</button>':''}</div>`; return; }
        c.innerHTML="";
        data.forEach((m,idx)=>{
            const p=(m.joined/m.total)*100; const full=m.joined>=m.total; const joined=window.db.joined_ids.includes(m.id);
            const done=m.status==='completed';
            const img=m.img||window.gameArt.banner(m);
            let targetMs=0, timeDisplay="TBD";
            if(m.startTime){ targetMs=m.startTime.seconds?m.startTime.seconds*1000:new Date(m.startTime).getTime(); timeDisplay=done?`<span>${window.app._fmtDT(m.startTime)}</span>`:`<span class="countdown-timer" data-target="${targetMs}">Loading...</span>`; }
            let btnAction=(joined||done)?"":(full?"":`window.app.checkLogin(() => window.app.openJoin('${m.id}'))`);
            const fmt=window.app._formatLabel(m);
            const pi=window.app._prizeInfo(m);
            const locked = !joined && !done && (m.status==='live' || !!(m.password && String(m.password).trim()));
            const btnStyle = (full||joined||locked||done)?'background:#e2e8f0; color:#64748b; box-shadow:none;':'';
            const btnLabel = done?'COMPLETED':joined?'JOINED ✅':locked?'<i class="fa-solid fa-lock"></i> MATCH STARTED — TRY NEXT MATCH':full?'FULL':'JOIN NOW';
            const btnClick = (locked||done)?'':btnAction;
            const btnDisabled = (locked||done)?'disabled':'';
            const code = m.matchCode || m.id.slice(0,8).toUpperCase();
            const ptime = (!done && m.prizeTime) ? `<div class="prize-time"><i class="fa-solid fa-clock"></i> Prize payout: <b>${window.app._fmtDT(m.prizeTime)}</b></div>` : '';
            c.innerHTML+=`<div class="match-card gm-card" style="animation-delay:${Math.min(idx*70,420)}ms"><div class="match-banner"><img src="${img}" alt="Free Fire Tournament"><div class="card-badge badge-live">${done?'<span style="color:#fbbf24">ENDED</span>':'LIVE'}</div><div class="card-badge badge-type">${fmt} • ${m.map||'Bermuda'}</div><div class="match-info-overlay"><div class="match-title">${m.pinned?'📌 ':''}${m.title}</div><div class="match-meta"><span class="mid-pill">#${code}</span>${timeDisplay}</div></div></div><div class="match-body"><div class="card-stats-grid"><div><div class="stat-val text-primary">${pi.big}</div><div class="stat-lbl">${pi.lbl}</div></div><div><div class="stat-val">${window.app.coinHtml(m.fee)}</div><div class="stat-lbl">Fee</div></div><div><div class="stat-val">${m.total}</div><div class="stat-lbl">Slots</div></div></div>${pi.rows?`<div class="pz-row">${pi.rows}</div>`:''}${window.app._slotStrip(m)}${window.app.rosterBtn(m)}${ptime}${done?window.app._winnersStrip(m):`<div class="progress-area"><div class="progress-bar"><div class="progress-fill" style="width:${p}%"></div></div><div class="prog-text"><span>${m.joined}/${m.total} Joined</span><span>${m.total-m.joined} Left</span></div></div>`}<button class="btn-main" ${btnDisabled} style="${btnStyle}" onclick="${btnClick}">${btnLabel}</button></div></div>`;
        });
        window.timers.tick();
    },
});
