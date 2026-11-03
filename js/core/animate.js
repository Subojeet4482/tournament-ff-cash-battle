/**
 * Entrance-animation controller.
 * - Page enter: adds .anim-in to the visible .page-section for ~1s.
 * - First render of any list (matches, rank, history, notifications, friends…):
 *   adds .anim-list for ~1s. Re-renders of an already filled list (15s auto-refresh)
 *   are ignored so cards never flicker.
 */
(function(){
    const ITEM = '.match-card,.mm-card,.rank-item,.trx-item,.notif-card,.claim-card,.friend-item';
    const LISTS = ['matches-container','my-matches-list','lb-list','trx-list','wh-list','notif-list','notif-list-container','friend-list','fc-list'];
    const flash = (el, cls, ms=1100) => {
        if(!el) return;
        el.classList.remove(cls); void el.offsetWidth;      // restart if already running
        el.classList.add(cls);
        clearTimeout(el._fxT); el._fxT = setTimeout(()=>el.classList.remove(cls), ms);
    };

    // 1) page enter — hook into nav.renderPage
    const wrapNav = () => {
        if(!window.nav || window.nav._fx) return !!(window.nav && window.nav._fx);
        const orig = window.nav.renderPage;
        window.nav.renderPage = function(p){
            const r = orig.apply(this, arguments);
            flash(document.getElementById('page-'+p), 'anim-in');
            return r;
        };
        window.nav._fx = true;
        return true;
    };
    wrapNav();

    // 2) lists — animate only the first fill (or fill after an empty / skeleton / empty-state)
    const obs = new MutationObserver((muts)=>{
        for(const m of muts){
            const el = m.target;
            if(!el.id || !LISTS.includes(el.id)) continue;
            const hadItems = [...m.removedNodes].some(n => n.nodeType===1 && (n.matches?.(ITEM) || n.querySelector?.(ITEM)));
            const hasItems = el.querySelector(ITEM);
            if(hasItems && !hadItems) flash(el, 'anim-list');
        }
    });
    const attach = () => {
        LISTS.forEach(id => { const el = document.getElementById(id); if(el && !el._fxObs){ obs.observe(el,{childList:true}); el._fxObs = true; } });
    };
    attach();

    // 3) first page + modals opened later
    flash(document.querySelector('.page-section:not(.hidden)'), 'anim-in', 1300);
    // notifications / history lists live inside modals — observe when a modal opens
    document.addEventListener('click', () => setTimeout(attach, 50), true);
})();
