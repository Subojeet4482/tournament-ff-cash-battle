/**
 * Hide the header while scrolling down, show on scroll up.
 */
const run = () => {
    const header=document.querySelector('header');
    document.querySelectorAll('.page-section').forEach(section=>{
        let lastScrollTop=0;
        section.addEventListener('scroll',function(){
            let currentScroll=this.scrollTop;
            if(Math.abs(lastScrollTop-currentScroll)<=5) return;
            if(currentScroll>lastScrollTop&&currentScroll>60) header.style.transform='translateY(-100%)';
            else header.style.transform='translateY(0)';
            lastScrollTop=currentScroll;
        });
    });
};

// Fragments are injected after DOMContentLoaded, so run immediately when the DOM is already ready.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
else run();
