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
            '<h2>App load nahi hua</h2><p>' + (isFile
                ? 'Ye project <b>file://</b> se nahi chalta. Local server se kholo (README dekho), e.g. <code>npx serve</code> ya VS Code Live Server.'
                : String(err.message || err)) + '</p></div>';
    }
})();
