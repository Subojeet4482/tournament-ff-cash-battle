/**
 * Register new account (creates Firebase user + Firestore profile).
 */
import { createUserWithEmailAndPassword, updateProfile, collection, getDocs, doc, setDoc, getDoc, query, where, authService, dbService } from '../../js/core/firebase.js';

Object.assign(window.auth, {
    // First-time Google user ke liye Firestore profile banata hai (email signup jaisa hi structure)
    _ensureProfile: async (user) => {
        try {
            const ref = doc(dbService, "users", user.uid);
            if((await getDoc(ref)).exists()) return;
            let playerId = "", tries = 0;
            while(tries < 20){
                playerId = String(Math.floor(1000000 + Math.random()*9000000));
                const dup = await getDocs(query(collection(dbService,"users"), where("playerId","==",playerId)));
                if(dup.empty) break;
                tries++;
            }
            await setDoc(ref, {
                appName: user.displayName || (user.email||'Player').split('@')[0], email: user.email||"", phone: user.phoneNumber||"",
                balance:0, depositBalance:0, withdrawBalance:0, uid:user.uid, playerId,
                joined_matches:[], score:0, kills:0, matchesPlayed:0, matchesWon:0, totalEarned:0,
                gameName:"", gameUid:"", isUidVerified:false, photoUrl:user.photoURL||"", nameChangesLeft:2
            });
        } catch(e) { console.error('ensureProfile', e); }
    },
    register: async () => {
        const g=(id)=>document.getElementById(id);
        const nameEl=g('reg-name'), phoneEl=g('reg-phone'), emailEl=g('reg-email'), passEl=g('reg-pass'), btn=g('btn-register');
        const name=nameEl.value, email=emailEl.value.trim(), phone=phoneEl.value, pass=passEl.value;
        if(!name||!email||!pass||!phone){ window.auth._fail([!name&&nameEl,!phone&&phoneEl,!email&&emailEl,!pass&&passEl]); return window.ui.toast('Fill all fields'); }
        if(phone.length<10){ window.auth._fail([phoneEl]); return window.ui.toast('Invalid Phone'); }
        window.auth._busy(btn,true,'Creating account...');
        try {
            const cred=await createUserWithEmailAndPassword(authService,email,pass);
            await updateProfile(cred.user,{displayName:name});
            // ===== Generate unique 7-digit Player ID (Point 1) =====
            let playerId="", tries=0;
            while(tries<20){
                playerId = String(Math.floor(1000000 + Math.random()*9000000));
                const dup = await getDocs(query(collection(dbService,"users"), where("playerId","==",playerId)));
                if(dup.empty) break;
                tries++;
            }
            await setDoc(doc(dbService,"users",cred.user.uid),{
                appName:name, email, phone, balance:0, depositBalance:0, withdrawBalance:0, uid:cred.user.uid,
                playerId,
                joined_matches:[], score:0, kills:0, matchesPlayed:0, matchesWon:0, totalEarned:0,
                gameName:"", gameUid:"", isUidVerified:false, photoUrl:"", nameChangesLeft:2
            });
            await window.auth._done('Account Created!','Setting up your wallet…');
            window.auth.hideAuth();
            if(window.auth._welcome) window.auth._welcome(name,'Your account is ready');
        } catch(e) { window.auth._busy(btn,false); window.auth._fail([emailEl,passEl]); window.ui.toast(window.auth._friendly?window.auth._friendly(e):e.message); }
    },
});
