/**
 * Browser back-button handling (modals, drawer, pages).
 */
window.historyManager = {
    init: () => {
        history.replaceState({page:'home'},null,window.location.pathname);
        window.addEventListener('popstate',(event)=>{
            const state=event.state; const activeModal=document.querySelector('.modal-wrap.active');
            if(activeModal){ ui.closeModal(true); return; }
            const drawer=document.getElementById('drawer-wrapper');
            if(drawer.classList.contains('drawer-active')){ ui.toggleDrawer(true); return; }
            if(state&&state.page) window.nav.renderPage(state.page); else window.nav.renderPage('home');
        });
    }
};
