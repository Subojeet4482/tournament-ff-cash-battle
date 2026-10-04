/**
 * Payment-verification loading overlay.
 */
Object.assign(window.app, {
    _showVerifyOverlay: (title, sub, mode) => {
        const el=document.getElementById('dep-verify-overlay'); if(!el) return;
        const icon=document.getElementById('dvo-icon');
        const t=document.getElementById('dvo-title');
        const s=document.getElementById('dvo-sub');
        const timer=document.getElementById('dvo-timer');
        const closeBtn=document.getElementById('dvo-close');
        el.style.display='flex';
        if(t) t.innerText=title;
        if(s) s.innerText=sub;
        if(mode==='success'){
            icon.style.background='linear-gradient(135deg,#10b981,#34d399)';
            icon.innerHTML='<i class="fa-solid fa-circle-check"></i>';
            timer.style.display='none'; closeBtn.style.display='inline-block';
        } else if(mode==='fail'){
            icon.style.background='linear-gradient(135deg,#ef4444,#f87171)';
            icon.innerHTML='<i class="fa-solid fa-circle-exclamation"></i>';
            timer.style.display='none'; closeBtn.style.display='inline-block';
        } else {
            icon.style.background='linear-gradient(135deg,#4f46e5,#818cf8)';
            icon.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i>';
            timer.style.display='block'; closeBtn.style.display='none';
        }
    },
    _hideVerifyOverlay: () => { const el=document.getElementById('dep-verify-overlay'); if(el) el.style.display='none'; },
});
