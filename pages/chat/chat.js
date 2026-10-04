/**
 * Chat core: creates window.chat and holds its shared state. Sub-pages extend it.
 */
window.chat = {
    _unsubs: {},
    _thread: null,      // {type:'dm'|'group', id, peer}
    _replyTo: {wc:null, th:null},
    _lastFsTab: 'results',
    _openedOnce: false,
};
