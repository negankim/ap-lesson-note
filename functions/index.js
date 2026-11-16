/* AP 레슨 노트 · 서버 함수
 * ai: 레슨 정리(organize)와 연습 피드백 조정(feedback)을 Claude API로 처리한다.
 * - API 키는 Firebase 비밀값(ANTHROPIC_API_KEY)에만 있다. 코드와 브라우저에는 없다.
 * - 로그인한 사람만 부를 수 있고, 하루 사용 횟수를 센다. */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { organizePrompt, feedbackPrompt, chatPrompt } = require("./prompts");

admin.initializeApp();
const db = admin.firestore();
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

/* 모델: 정리는 정확도 우선, 피드백은 빠르고 싸게. 바꾸면 docs/decisions.md 에 기록. */
const MODEL = { organize: "claude-sonnet-5-5", feedback: "claude-haiku-5-5", chat: "claude-haiku-5-5" };
/* 하루 사용 한도 (사람당). 파일럿 비용 관리용. */
const DAILY_LIMIT = { organize: 20, feedback: 40, chat: 10 };

async function callClaude(model, prompt, maxTokens) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY.value(),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("Claude API error", res.status, body.slice(0, 500));
    throw new HttpsError("unavailable", "AI 응답을 받지 못했습니다.");
  }
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("");
  if (data.stop_reason === "max_tokens") {
    console.error("Claude answer cut off (max_tokens)", model, maxTokens, text.length);
    throw new HttpsError("internal", "AI 응답이 너무 길어 잘렸습니다.");
  }
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    console.error("Claude answer has no JSON", data.stop_reason, text.slice(0, 500));
    throw new HttpsError("internal", "AI 응답 형식이 맞지 않습니다.");
  }
  try { return JSON.parse(text.slice(start, end + 1)); }
  catch (e) {
    console.error("Claude answer JSON parse failed", e.message, text.slice(0, 300), "...", text.slice(-300));
    throw new HttpsError("internal", "AI 응답을 읽지 못했습니다.");
  }
}

async function countUse(uid, task) {
  let used = 0;
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
  const ref = db.doc(`usage/${uid}_${day}`);
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const n = (snap.exists && snap.data()[task]) || 0;
    if (n >= DAILY_LIMIT[task]) throw new HttpsError("resource-exhausted", "오늘 사용 한도를 넘었습니다.");
    t.set(ref, { uid, day, [task]: n + 1 }, { merge: true });
    used = n + 1;
  });
  return used;
}

/* 미성년자 보호: 나이 확인 전, 또는 만 14세 미만인데 보호자 확인 전이면 AI를 쓰지 않는다.
 * 나이 구분은 브라우저가 보낸 값이 아니라 서버가 users 문서에서 읽는다. */
async function ageOf(uid) {
  const me = await db.doc("users/" + uid).get();
  const u = me.exists ? me.data() : {};
  if (["coach", "admin"].includes(u.role)) return "adult";
  if (!u.ageBand) throw new HttpsError("failed-precondition", "age-required");
  if (u.ageBand === "child" && u.guardianVerified !== true) throw new HttpsError("failed-precondition", "guardian-pending");
  return u.ageBand;
}

exports.ai = onCall({ secrets: [ANTHROPIC_API_KEY], region: "asia-northeast3", timeoutSeconds: 120 }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const d = req.data || {};
  const minor = (await ageOf(req.auth.uid)) !== "adult";
  if (d.task === "organize") {
    const text = String(d.text || "").slice(0, 12000);
    if (text.length < 20) throw new HttpsError("invalid-argument", "레슨 내용이 너무 짧습니다.");
    await countUse(req.auth.uid, "organize");
    const libSnap = await db.collection("library").where("status", "==", "active").get();
    const lib = libSnap.docs.map((x) => ({ id: x.id, ...x.data() }));
    return callClaude(MODEL.organize, organizePrompt({
      text, coach: String(d.coach || "").slice(0, 40), profile: d.profile || {}, history: (d.history || []).slice(0, 3), lib, minor,
    }), 16000);
  }
  if (d.task === "feedback") {
    await countUse(req.auth.uid, "feedback");
    return callClaude(MODEL.feedback, feedbackPrompt({
      lesson: d.lesson || {}, verdict: String(d.verdict || ""), text: String(d.text || "").slice(0, 300), minor,
    }), 2000);
  }
  if (d.task === "chat") {
    const q = String(d.text || "").trim().slice(0, 400);
    if (!q) throw new HttpsError("invalid-argument", "질문이 비어 있습니다.");
    const used = await countUse(req.auth.uid, "chat");
    const base = "players/" + req.auth.uid;
    /* 근거는 브라우저가 보낸 값이 아니라 서버가 읽은 본인 기록이다 */
    const [ls, pf, hs] = await Promise.all([
      db.collection(base + "/lessons").get(),
      db.doc(base).get(),
      db.collection(base + "/chats").orderBy("at", "desc").limit(6).get(),
    ]);
    const lessons = ls.docs.map((x) => ({ id: x.id, ...x.data() })).filter((l) => l.result)
      .sort((a, b) => ((b.date || "") + (b.createdAt || "")).localeCompare((a.date || "") + (a.createdAt || ""))).slice(0, 5);
    const history = hs.docs.map((x) => x.data()).reverse();
    const r = await callClaude(MODEL.chat, chatPrompt({
      question: q, lessons, profile: pf.exists ? pf.data() : {}, history, minor,
      today: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10),
    }), 1500);
    const who = ["logan", "rook", "daryl", "paco"].includes(r.who) ? r.who : "logan";
    const sources = (Array.isArray(r.sources) ? r.sources : []).map((s) => lessons[Number(String(s).replace(/\D/g, "")) - 1])
      .filter(Boolean).slice(0, 3).map((l) => ({ id: l.id, date: l.date || "", coach: l.coach || "", title: (l.result && l.result.title) || "" }));
    const ans = {
      who, text: String(r.answer || "").slice(0, 1200), sources,
      basis: sources.length && r.basis !== "AI 추정" ? "기록" : "AI 추정",
      coach_check: !!r.coach_check,
    };
    const col = db.collection(base + "/chats"), now = Date.now();
    await col.add({ role: "user", text: q, at: now });
    await col.add({ role: "crew", ...ans, at: now + 1 });
    return { ...ans, used, limit: DAILY_LIMIT.chat };
  }
  throw new HttpsError("invalid-argument", "알 수 없는 요청입니다.");
});

/* 훈련 라이브러리 첫 데이터 넣기 — 관리자만, 없는 항목만 추가(코치진이 고친 내용은 덮어쓰지 않음) */
exports.seedLibrary = onCall({ region: "asia-northeast3" }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const me = await db.doc("users/" + req.auth.uid).get();
  if (!me.exists || me.data().role !== "admin") throw new HttpsError("permission-denied", "관리자만 할 수 있습니다.");
  const items = require("./library-seed.json");
  let added = 0, skipped = 0;
  for (const [id, data] of Object.entries(items)) {
    const ref = db.doc("library/" + id);
    if ((await ref.get()).exists) { skipped++; continue; }
    await ref.set(data); added++;
  }
  return { added, skipped };
});
