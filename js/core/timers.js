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
            if(distance<0){ el.innerHTML="<span class='countdown-ended'>LIVE / ENDED</span>"; }
            else {
                const h=Math.floor((distance%(1000*60*60*24))/(1000*60*60));
                const m=Math.floor((distance%(1000*60*60))/(1000*60));
                const s=Math.floor((distance%(1000*60))/1000);
                el.innerHTML=`<i class="fa-regular fa-clock"></i> ${h<10?"0"+h:h}h ${m<10?"0"+m:m}m ${s<10?"0"+s:s}s`;
                el.style.color=distance<3600000?"#ef4444":"#fbbf24";
            }
        });
    }
};
