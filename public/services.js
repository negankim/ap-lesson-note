/* AP 레슨 노트 · 서비스 연결 (Firebase 로그인·DB·서버 함수, 브라우저 음성 입력)
 * app.js 는 화면만 담당하고, 여기서 넘겨 주는 db / user / ai / dict 만 쓴다.
 * 파일럿(claude.ai 아티팩트)과 같은 모양으로 감싸 두어 화면 코드를 그대로 옮길 수 있다. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { start } from "./app.js";

/* Firebase Hosting 이 자동으로 주는 설정을 쓴다 (키를 코드에 적지 않는다) */
const config = await fetch("/__/firebase/init.json").then((r) => r.json());
const app = initializeApp(config);
const auth = getAuth(app);
const fs = getFirestore(app);
const fn = getFunctions(app, "asia-northeast3");

const wrapDocs = (s) => ({ docs: s.docs.map((d) => ({ id: d.id, data: () => d.data() })) });
const db = {
  collection: (path) => ({
    get: async () => wrapDocs(await getDocs(collection(fs, path))),
    add: (data) => addDoc(collection(fs, path), data),
    onSnapshot: (cb, err) => onSnapshot(collection(fs, path), (s) => cb(wrapDocs(s)), err),
  }),
  doc: (path) => ({
    get: async () => { const d = await getDoc(doc(fs, path)); return { exists: d.exists(), data: () => d.data() }; },
    set: (data) => setDoc(doc(fs, path), data),
    update: (data) => updateDoc(doc(fs, path), data),
  }),
};

/* 역할: users/{uid}.role = player | coach | admin  (코치·관리자는 콘솔이나 관리자가 지정) */
function makeUser(u, role) {
  const names = {};
  return {
    id: async () => u.uid,
    me: async () => ({ name: u.displayName || u.email || "" }),
    canEdit: async () => role === "coach" || role === "admin",
    profiles: async (ids) => {
      const out = {};
      await Promise.all(ids.map(async (id) => {
        if (!(id in names)) { try { const d = await getDoc(doc(fs, "users/" + id)); names[id] = d.exists() ? d.data().name || "" : ""; } catch (_) { names[id] = ""; } }
        out[id] = { name: names[id] };
      }));
      return out;
    },
  };
}

/* 브라우저 음성 입력 (크롬·안드로이드·데스크톱). 없으면 null → 키보드 입력만 */
function makeDictation() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  let rec = null, h = { p: () => {}, f: () => {}, s: () => {} }, want = false;
  const boot = () => {
    rec = new SR(); rec.lang = "ko-KR"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) h.f({ text: r[0].transcript.trim() }); else interim += r[0].transcript;
      }
      h.p({ text: interim });
    };
    rec.onstart = () => h.s({ state: "listening" });
    rec.onend = () => { if (want) { try { rec.start(); return; } catch (_) {} } h.s({ state: "idle", reason: "stopped" }); };
    rec.onerror = (e) => { if (e.error === "not-allowed") { want = false; h.s({ state: "idle", reason: "not_granted" }); } };
  };
  return {
    onPartial: (f) => (h.p = f), onFinal: (f) => (h.f = f), onState: (f) => (h.s = f),
    start: () => new Promise((res, rej) => { try { if (!rec) boot(); want = true; rec.start(); res(); } catch (e) { rej({ code: "dismissed" }); } }),
    stop: () => new Promise((res) => { want = false; try { rec.stop(); } catch (_) {} res(); }),
  };
}

const $ = (id) => document.getElementById(id);
document.querySelectorAll("[data-login]").forEach((b) => b.addEventListener("click", async () => {
  $("login-st").textContent = "";
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { $("login-st").textContent = "로그인하지 못했습니다. 팝업 차단을 풀고 다시 눌러 주세요."; }
}));
$("logout").addEventListener("click", () => signOut(auth).then(() => location.reload()));

let started = false;
onAuthStateChanged(auth, async (u) => {
  $("gate").hidden = !!u; $("app").hidden = !u;
  if (!u || started) return;
  started = true;
  /* 사용자 문서: 이름만 본인이 쓰고, 역할은 규칙상 본인이 못 바꾼다 */
  const ref = doc(fs, "users/" + u.uid);
  let role = "player";
  try {
    const d = await getDoc(ref);
    if (d.exists()) { role = d.data().role || "player"; await updateDoc(ref, { name: u.displayName || "", lastSeen: serverTimestamp() }); }
    else await setDoc(ref, { name: u.displayName || "", role: "player", createdAt: serverTimestamp(), lastSeen: serverTimestamp() });
  } catch (e) { console.warn("users doc", e); }
  await start({ db, user: makeUser(u, role), ai: httpsCallable(fn, "ai", { timeout: 120000 }), dict: makeDictation(), seedFn: httpsCallable(fn, "seedLibrary", { timeout: 120000 }) });
});
