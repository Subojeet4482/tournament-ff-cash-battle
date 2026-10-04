/**
 * Tiny HTML include loader.
 * Replaces <div data-include="path/to/file.html"></div> with that file's markup.
 * Works recursively (e.g. chat.html includes the chat sub-pages).
 */
export async function loadIncludes(root = document.body) {
    let nodes;
    while ((nodes = root.querySelectorAll('[data-include]')).length) {
        await Promise.all([...nodes].map(async (el) => {
            const path = el.getAttribute('data-include');
            const res = await fetch(new URL(path, document.baseURI));
            if (!res.ok) throw new Error('Could not load ' + path + ' (' + res.status + ')');
            const tpl = document.createElement('template');
            tpl.innerHTML = await res.text();
            el.replaceWith(tpl.content);
        }));
    }
}
