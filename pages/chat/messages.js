/**
 * Shared message rendering: bubbles, files, replies, reactions, long-press menu.
 */
import { collection, doc, updateDoc, addDoc, serverTimestamp, runTransaction, sRef, uploadBytes, getDownloadURL, dbService, storageService } from '../../js/core/firebase.js';

Object.assign(window.chat, {
    _renderMsg(m, ctx){
        const isMe = m.uid === window.db.user_uid;
        const time = m.createdAt && m.createdAt.seconds ? new Date(m.createdAt.seconds*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
        const reply = m.replyTo ? `<div class="msg-reply-ref">${this._safe(m.replyTo.text||'[media]')}</div>` : '';
        let content = '';
        if(m.deleted){ content = '<i style="opacity:.6;">This message was deleted</i>'; }
        else if(m.type==='image') content = `<img class="msg-img" src="${m.url}">`;
        else if(m.type==='video') content = `<video class="msg-vid" src="${m.url}" controls></video>`;
        else if(m.type==='audio') content = `<audio src="${m.url}" controls style="max-width:200px;"></audio>`;
        else if(m.type==='file')  content = `<a class="msg-file" href="${m.url}" target="_blank"><i class="fa-solid fa-file"></i> ${this._safe(m.fileName||'file')}</a>`;
        else content = this._safe(m.text||'');
        if(m.edited) content += ' <span style="font-size:0.65rem;opacity:.7;">(edited)</span>';
        const rx = m.reactions ? Object.entries(m.reactions).filter(([k,v])=>v&&v.length).map(([k,v])=>`<span class="msg-reaction" onclick="chat.toggleReaction('${ctx}','${m.id}','${k}')">${k} ${v.length}</span>`).join('') : '';
        const avImg = m.photoURL ? `<img src="${m.photoURL}" alt="">` : this._safe((m.name||'U')[0].toUpperCase());
        const avClick = m.uid ? `onclick="event.stopPropagation(); chat.openProfileById('${m.uid}')"` : '';
        return `<div class="msg-row ${isMe?'me':''}" data-mid="${m.id}" data-deleted="${m.deleted?1:0}" data-edited="${m.edited?1:0}" oncontextmenu="event.preventDefault(); chat.msgMenu('${ctx}','${m.id}',${isMe})">
            <div class="msg-avatar" ${avClick}>${avImg}</div>
            <div class="msg-content">
                ${reply}
                <div class="msg-bubble">
                    <div class="msg-name" style="cursor:pointer;" ${avClick}>${this._safe(m.name||'User')}</div>
                    <div class="msg-text">${content}</div>
                    <div class="msg-time">${time}${m.pinned?' <i class="fa-solid fa-thumbtack"></i>':''}</div>
                </div>
                ${rx?`<div class="msg-reactions">${rx}</div>`:''}
            </div>
        </div>`;
    },
    _safe(s){ return String(s||'').replace(/[<>&]/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); },
    async sendFile(ctx, file){
        if(ctx==='world'){ ui.toast('World Chat is text-only'); return; }
        if(!file) return;
        if(file.size > 20*1024*1024){ ui.toast('Max 20MB'); return; }
        const kind = file.type.startsWith('image/')?'image': file.type.startsWith('video/')?'video': file.type.startsWith('audio/')?'audio':'file';
        const folder = kind==='image'?'chat_images': kind==='video'?'chat_videos': kind==='audio'?'voice_notes':'documents';
        const path = folder + '/' + window.db.user_uid + '_' + Date.now() + '_' + file.name.replace(/[^\w.-]/g,'_');
        const r = sRef(storageService, path);
        ui.toast('Uploading...');
        try{
            await uploadBytes(r, file);
            const url = await getDownloadURL(r);
            const base = { uid: window.db.user_uid, name: window.db.user_name||'User', photoURL: (window.db.user_data && window.db.user_data.photoURL) || '', type:kind, url, fileName:file.name, size:file.size, createdAt: serverTimestamp() };
            if(ctx==='world'){ /* disabled: no files in world chat */ return; }
            else if(ctx==='thread' && this._thread){
                if(this._thread.type==='dm')    await addDoc(collection(dbService,'chats',this._thread.id,'messages'), base);
                else                            await addDoc(collection(dbService,'groups',this._thread.id,'messages'), base);
            }
        }catch(e){ ui.toast('Upload failed'); }
    },
    setReply(ctx, mid, text){ this._replyTo[ctx] = {mid, text}; const bar=document.getElementById(ctx+'-reply-bar'); bar.classList.remove('hidden'); document.getElementById(ctx+'-reply-text').innerText = 'Replying: '+ text.slice(0,60); },
    cancelReply(ctx){ this._replyTo[ctx] = null; document.getElementById(ctx+'-reply-bar').classList.add('hidden'); },
    async toggleReaction(ctx, mid, emoji){
        const refDoc = (ctx==='world') ? doc(dbService,'world_messages',mid) :
                       (this._thread && this._thread.type==='dm') ? doc(dbService,'chats',this._thread.id,'messages',mid) :
                       doc(dbService,'groups',this._thread.id,'messages',mid);
        try{
            await runTransaction(dbService, async (tx)=>{
                const snap = await tx.get(refDoc); if(!snap.exists()) return;
                const r = snap.data().reactions || {}; const arr = r[emoji]||[]; const me=window.db.user_uid;
                if(arr.includes(me)) r[emoji]=arr.filter(x=>x!==me); else r[emoji]=arr.concat(me);
                tx.update(refDoc,{reactions:r});
            });
        }catch(e){}
    },
    msgMenu(ctx, mid, isMe){
        const opts = ['React ❤️','React 👍','React 😂','Reply'];
        if(isMe) opts.push('Edit','Delete for me','Delete for everyone');
        else opts.push('Report');
        const pick = prompt(opts.map((o,i)=>(i+1)+'. '+o).join('\n')+'\n\nEnter number:');
        const n = parseInt(pick); if(!n) return;
        const opt = opts[n-1];
        if(opt.startsWith('React')){ this.toggleReaction(ctx,mid,opt.split(' ')[1]); return; }
        if(opt==='Reply'){
            const el = document.querySelector(`.msg-row[data-mid="${mid}"] .msg-text`);
            this.setReply(ctx==='world'?'wc':'th', mid, el?el.innerText:''); return;
        }
        if(opt==='Edit'){
            const el = document.querySelector(`.msg-row[data-mid="${mid}"] .msg-text`);
            const t = prompt('Edit:', el?el.innerText:''); if(t===null) return;
            const refDoc = ctx==='world'?doc(dbService,'world_messages',mid) : (this._thread.type==='dm'?doc(dbService,'chats',this._thread.id,'messages',mid):doc(dbService,'groups',this._thread.id,'messages',mid));
            updateDoc(refDoc,{text:t, edited:true});
            return;
        }
        if(opt==='Delete for me'){
            const el = document.querySelector(`.msg-row[data-mid="${mid}"]`); if(el) el.style.display='none';
            return;
        }
        if(opt==='Delete for everyone'){
            const refDoc = ctx==='world'?doc(dbService,'world_messages',mid) : (this._thread.type==='dm'?doc(dbService,'chats',this._thread.id,'messages',mid):doc(dbService,'groups',this._thread.id,'messages',mid));
            updateDoc(refDoc,{deleted:true, text:''});
            return;
        }
        if(opt==='Report'){
            const reason = prompt('Reason:'); if(!reason) return;
            addDoc(collection(dbService,'reports'),{type:'message', target:mid, ctx, reporter:window.db.user_uid, reason, createdAt: serverTimestamp(), status:'open'}).then(()=>ui.toast('Reported'));
        }
    },
});
