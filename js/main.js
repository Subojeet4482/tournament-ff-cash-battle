/**
 * Entry point.
 * 1) Inject all HTML fragments (pages / components / modals)
 * 2) Load every JS module (js/modules.js)
 */
import { loadIncludes } from './core/include.js';

(async () => {
    try {
        await loadIncludes(document.body);
        await import('./modules.js');
    } catch (err) {
        console.error(err);
        const isFile = location.protocol === 'file:';
        document.body.innerHTML =
            '<div style="font-family:sans-serif;padding:30px;line-height:1.6">' +
            '<h2>The app could not load</h2><p>' + (isFile
                ? 'This project cannot run from <b>file://</b>. Please open it with a local server (see README), e.g. <code>npx serve</code> or VS Code Live Server.'
                : String(err.message || err)) + '</p></div>';
    }
})();
