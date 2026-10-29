/**
 * Bottom-nav page switching.
 */
window.nav = {
    goto: (p,e) => {
        if(!document.getElementById('page-'+p).classList.contains('hidden')) return;
        history.pushState({page:p},null,'#'+p); window.nav.renderPage(p);
    },
    renderPage: (p) => {
        document.querySelectorAll('.page-section').forEach(d=>d.classList.add('hidden'));
        document.getElementById('page-'+p).classList.remove('hidden');
        document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
        const navLabels={'home':0,'matches':1,'chat':2,'leaderboard':3,'wallet':4};
        // Hide chat sub-views when leaving chat page
        if(p!=='chat'){ document.querySelectorAll('.chat-sub-view').forEach(v=>v.classList.add('hidden')); const h=document.getElementById('chat-hub'); if(h) h.classList.remove('hidden'); }
        // Toggle chat-mode body class (hides global header on chat page for more space)
        document.body.classList.toggle('chat-mode', p==='chat');
        if(p==='chat' && window.chat && window.chat.onOpen) window.chat.onOpen();
        if(navLabels[p]!==undefined) document.querySelectorAll('.nav-item')[navLabels[p]].classList.add('active');
        if(p==='matches'&&window.app.renderMyMatches) window.app.renderMyMatches();
        document.querySelector('header').style.transform='translateY(0)';
    }
};
