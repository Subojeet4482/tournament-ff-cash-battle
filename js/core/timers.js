/**
 * Live header clock + match countdown timers.
 */
window.timers = {
    interval: null,
    start: () => { if(window.timers.interval) clearInterval(window.timers.interval); window.timers.interval=setInterval(window.timers.tick,1000); window.timers.tick(); },
    tick: () => {
        const now = new Date().getTime();
        // Live header clock
        const clk=document.getElementById('header-clock');
        if(clk){ const d=new Date(); const p=n=>n<10?'0'+n:n; clk.innerText=`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
        document.querySelectorAll('.countdown-timer').forEach(el => {
            const targetTime = parseInt(el.getAttribute('data-target'));
            if(!targetTime||isNaN(targetTime)) return;
            const distance = targetTime - now;
            if(distance<0){ if(el.dataset.ended!=='1'){ el.dataset.ended='1'; el.innerHTML="<span class='countdown-ended'><i class='fa-solid fa-circle-play'></i> LIVE / ENDED</span>"; } }
            else {
                const d=Math.floor(distance/86400000);
                const h=Math.floor((distance%86400000)/3600000);
                const m=Math.floor((distance%3600000)/60000);
                const s=Math.floor((distance%60000)/1000);
                const p2=n=>n<10?"0"+n:""+n;
                const seg=(v,l,k)=>`<span class="cd-seg ${k||''}"><b>${v}</b><i>${l}</i></span>`;
                // Days show only when there are days left; otherwise the row starts at hours
                let html=(d>0?seg(p2(d),'DAY',(d===1?'':'')):'')+seg(p2(h),'HR')+seg(p2(m),'MIN')+seg(p2(s),'SEC','sec');
                el.dataset.ended='0';
                el.classList.add('cd-wrap'); el.classList.remove('cd-urgent','cd-soon','cd-far'); el.classList.add(distance<3600000?'cd-urgent':distance<86400000?'cd-soon':'cd-far');
                // only rewrite when something changed (keeps the animation smooth)
                if(el._html!==html){ el._html=html; el.innerHTML=html; }
            }
        });
    }
};
