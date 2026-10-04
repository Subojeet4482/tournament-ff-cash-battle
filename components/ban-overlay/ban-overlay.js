/**
 * Ban overlay check.
 */
Object.assign(window.app, {
    checkBan: (d) => {
        const overlay=document.getElementById('ban-overlay');
        let banned=d.isBanned===true;
        if(banned && d.bannedUntil && d.bannedUntil!=='permanent'){
            if(new Date(d.bannedUntil).getTime() < Date.now()) banned=false; // auto-expire
        }
        if(banned){
            const num=window.db.supportNumber||'';
            document.getElementById('ban-support').innerHTML = num
                ? `Support: <b>${num}</b><br><a href="https://wa.me/${num.replace(/[^0-9]/g,'')}" style="color:#fff; text-decoration:underline;">Contact on WhatsApp</a>`
                : `Please contact support.`;
            overlay.style.display='flex';
            return true;
        }
        overlay.style.display='none';
        return false;
    },
});
