/* AP 레슨 노트 · 서비스 연결 (Firebase 로그인·DB·서버 함수, 브라우저 음성 입력)
 * app.js 는 화면만 담당하고, 여기서 넘겨 주는 db / user / ai / dict 만 쓴다.
 * 파일럿(claude.ai 아티팩트)과 같은 모양으로 감싸 두어 화면 코드를 그대로 옮길 수 있다. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, serverTimestamp, query, where, orderBy, limit, collectionGroup } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { start, mountPlaza } from "./app.js";

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
  group: (name) => ({ get: async () => wrapDocs(await getDocs(collectionGroup(fs, name))) }),
  doc: (path) => ({
    get: async () => { const d = await getDoc(doc(fs, path)); return { exists: d.exists(), data: () => d.data() }; },
    set: (data) => setDoc(doc(fs, path), data),
    update: (data) => updateDoc(doc(fs, path), data),
    delete: () => deleteDoc(doc(fs, path)),
  }),
};

/* 역할: users/{uid}.role = player | coach | admin  (코치·관리자는 콘솔이나 관리자가 지정) */
function makeUser(u, role, extra = {}) {
  const names = {};
  return {
    id: async () => u.uid,
    me: async () => ({ name: extra.nickname || u.displayName || u.email || "" }),
    info: () => ({ email: u.email || "", provider: (u.providerData[0] && u.providerData[0].providerId) || "", google: u.displayName || "", nickname: extra.nickname || "", tone: extra.tone || "coach", research: !!extra.research, lang: extra.lang || "ko", country: extra.country || "" }),
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
  let rec = null, h = { p: () => {}, f: () => {}, s: () => {} }, want = false, lang = "ko-KR";
  const boot = () => {
    rec = new SR(); rec.lang = lang; rec.continuous = true; rec.interimResults = true;
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
    setLang: (l) => { lang = l || "ko-KR"; if (rec) { const was = want; want = false; try { rec.stop(); } catch (_) {} rec = null; want = was && false; } },
    getLang: () => lang,
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
  document.querySelectorAll(".lp-mate, .lp-cta, .plaza").forEach((el, i) => {
    el.classList.add("rv"); el.style.transitionDelay = (i % 5) * 70 + "ms"; io.observe(el);
  });
}
document.querySelectorAll("[data-login]").forEach((b) => b.addEventListener("click", async () => {
  $("login-st").textContent = "";
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { $("login-st").textContent = "로그인하지 못했습니다. 팝업 차단을 풀고 다시 눌러 주세요."; }
}));
$("logout").addEventListener("click", () => signOut(auth).then(() => location.reload()));

/* 보호자 동의가 필요한 나이: 모든 나라에서 만 14세 미만, 인도네시아·말레이시아는 만 18세 이하(teen)까지 */
export const needsGuardian = (ageBand, country) => ageBand === "child" || (ageBand === "teen" && ["ID", "MY"].includes(country));
/* 나이 확인과 보호자 동의 (만 14세 미만은 법정대리인 동의 필요 → 코치가 보호자와 통화로 확인 후 승인) */
function makeConsent(u, role) {
  const ref = doc(fs, "users/" + u.uid);
  return {
    status: async () => { const d = (await getDoc(ref)).data() || {}; return { ageBand: d.ageBand || null, country: d.country || "", guardianVerified: d.guardianVerified === true, guardianNeeded: needsGuardian(d.ageBand, d.country || "KR"), xb: d.xbConsent === true, staff: role === "coach" || role === "admin" }; },
    submit: async ({ ageBand, country, lang, xb, guardian }) => {
      const need = needsGuardian(ageBand, country);
      if (need) await setDoc(doc(fs, "guardians/" + u.uid), { ...guardian, player: u.displayName || "", country, agreedAt: serverTimestamp() });
      await updateDoc(ref, { ageBand, country, lang, guardianNeeded: need, ...(xb ? { xbConsent: true, xbAt: serverTimestamp() } : {}), consentAt: serverTimestamp(), consentVer: "2026-11-18" });
    },
    pending: async () => {
      const [a, b] = await Promise.all([getDocs(query(collection(fs, "users"), where("ageBand", "==", "child"))), getDocs(query(collection(fs, "users"), where("guardianNeeded", "==", true)))]);
      const seen = new Set(), list = [...a.docs, ...b.docs].filter((d) => !seen.has(d.id) && seen.add(d.id) && d.data().guardianVerified !== true);
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

/* 공동 레거시 나무: 집계 숫자는 로그인 전에도 읽는다 (첫 화면 광장) */
const legacy = {
  stats: async () => { try { const d = await getDoc(doc(fs, "legacy/stats")); return d.exists() ? d.data() : {}; } catch (_) { return {}; } },
  points: async (node) => {
    const s = await getDocs(query(collection(fs, "legacyPoints"), where("node", "==", node), limit(100)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.echoes || 1) - (a.echoes || 1) || (b.createdAt || 0) - (a.createdAt || 0));
  },
};
legacy.stats().then((st) => mountPlaza(document.getElementById("lp-tree"), st, { landing: true }));

let started = false;
onAuthStateChanged(auth, async (u) => {
  $("gate").hidden = !!u; $("app").hidden = !u;
  if (!u || started) return;
  started = true;
  /* 사용자 문서: 이름만 본인이 쓰고, 역할은 규칙상 본인이 못 바꾼다 */
  const ref = doc(fs, "users/" + u.uid);
  let role = "player", extra = {};
  try {
    const d = await getDoc(ref);
    if (d.exists()) { role = d.data().role || "player"; extra = { nickname: d.data().nickname || "", tone: d.data().tone || "coach", research: !!d.data().research, lang: d.data().lang || "", country: d.data().country || "" }; await updateDoc(ref, { name: u.displayName || "", lastSeen: serverTimestamp() }); }
    else await setDoc(ref, { name: u.displayName || "", role: "player", createdAt: serverTimestamp(), lastSeen: serverTimestamp() });
  } catch (e) { console.warn("users doc", e); }
  await start({ db, account: httpsCallable(fn, "account", { timeout: 120000 }), user: makeUser(u, role, extra), ai: httpsCallable(fn, "ai", { timeout: 120000 }), dict: makeDictation(), consent: makeConsent(u, role), chat: makeChat(u), legacy: { ...legacy, add: httpsCallable(fn, "legacy", { timeout: 60000 }) }, seedFn: httpsCallable(fn, "seedLibrary", { timeout: 120000 }) });
});
