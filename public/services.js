/* AP 레슨 노트 · 서비스 연결 (Firebase 로그인·DB·서버 함수, 브라우저 음성 입력)
 * app.js 는 화면만 담당하고, 여기서 넘겨 주는 db / user / ai / dict 만 쓴다.
 * 파일럿(claude.ai 아티팩트)과 같은 모양으로 감싸 두어 화면 코드를 그대로 옮길 수 있다. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, onSnapshot, serverTimestamp, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
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
    role: () => role,
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
/* 이런 골퍼가 있습니다: 한 장씩 자동으로 넘어감 (밀어서 넘기기, 누르고 있으면 멈춤) */
(() => {
  const rot = $("rot"); if (!rot) return;
  const cards = [...rot.querySelectorAll(".lp-card")], dots = $("rot-dots"), n = $("rot-n");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let i = 0, timer = null, paused = false;
  dots.innerHTML = cards.map((_, k) => `<button type="button" aria-label="${k + 1}번째 카드"></button>`).join("");
  const go = (k) => {
    const prev = i; i = (k + cards.length) % cards.length;
    cards.forEach((c, x) => { c.classList.toggle("on", x === i); c.classList.toggle("out", x === prev && x !== i); c.setAttribute("aria-hidden", x === i ? "false" : "true"); });
    [...dots.children].forEach((d, x) => d.setAttribute("aria-current", x === i ? "true" : "false"));
    n.textContent = `${i + 1} / ${cards.length}`;
  };
  const tick = () => { clearInterval(timer); if (!still) timer = setInterval(() => { if (!paused && !document.hidden) go(i + 1); }, 3500); };
  dots.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; go([...dots.children].indexOf(b)); tick(); });
  let x0 = null;
  rot.addEventListener("pointerdown", (e) => { x0 = e.clientX; paused = true; });
  rot.addEventListener("pointerup", (e) => { if (x0 !== null && Math.abs(e.clientX - x0) > 40) { go(i + (e.clientX < x0 ? 1 : -1)); tick(); } x0 = null; paused = false; });
  rot.addEventListener("pointerleave", () => { x0 = null; paused = false; });
  rot.addEventListener("mouseenter", () => (paused = true));
  rot.addEventListener("mouseleave", () => (paused = false));
  go(0); tick();
})();

/* 첫 화면: 카드와 단계가 스크롤할 때 하나씩 나타남 (움직임 줄이기 설정이면 그대로 보임) */
if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.15 });
  document.querySelectorAll(".lp-steps li, .lp-note, .lp-mate, .lp-cta").forEach((el, i) => {
    el.classList.add("rv"); el.style.transitionDelay = (i % 5) * 70 + "ms"; io.observe(el);
  });
}
document.querySelectorAll("[data-login]").forEach((b) => b.addEventListener("click", async () => {
  $("login-st").textContent = "";
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { $("login-st").textContent = "로그인하지 못했습니다. 팝업 차단을 풀고 다시 눌러 주세요."; }
}));
$("logout").addEventListener("click", () => signOut(auth).then(() => location.reload()));

/* 나이 확인과 보호자 동의 (만 14세 미만은 법정대리인 동의 필요 → 코치가 보호자와 통화로 확인 후 승인) */
function makeConsent(u, role) {
  const ref = doc(fs, "users/" + u.uid);
  return {
    status: async () => { const d = (await getDoc(ref)).data() || {}; return { ageBand: d.ageBand || null, guardianVerified: d.guardianVerified === true, staff: role === "coach" || role === "admin" }; },
    submit: async ({ ageBand, guardian }) => {
      if (ageBand === "child") await setDoc(doc(fs, "guardians/" + u.uid), { ...guardian, player: u.displayName || "", agreedAt: serverTimestamp() });
      await updateDoc(ref, { ageBand, consentAt: serverTimestamp(), consentVer: "2026-11-17" });
    },
    pending: async () => {
      const s = await getDocs(query(collection(fs, "users"), where("ageBand", "==", "child")));
      const list = s.docs.filter((d) => d.data().guardianVerified !== true);
      return Promise.all(list.map(async (d) => { const g = await getDoc(doc(fs, "guardians/" + d.id)); return { uid: d.id, name: d.data().name || "", guardian: g.exists() ? g.data() : null }; }));
    },
    verify: (uid) => updateDoc(doc(fs, "users/" + uid), { guardianVerified: true, verifiedBy: u.uid, verifiedAt: serverTimestamp() }),
  };
}

/* 오늘의 대화: 기록 읽기는 여기서, 보내기는 서버 함수(ai, task chat)가 저장까지 한다 */
function makeChat(u) {
  return {
    history: async (n = 30) => {
      const s = await getDocs(query(collection(fs, "players/" + u.uid + "/chats"), orderBy("at", "desc"), limit(n)));
      return s.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
    },
  };
}

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
  await start({ db, user: makeUser(u, role), ai: httpsCallable(fn, "ai", { timeout: 120000 }), dict: makeDictation(), consent: makeConsent(u, role), chat: makeChat(u), seedFn: httpsCallable(fn, "seedLibrary", { timeout: 120000 }) });
});
