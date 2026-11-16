/* AP 레슨 노트 · 서버 함수
 * ai: 레슨 정리(organize)와 연습 피드백 조정(feedback)을 Claude API로 처리한다.
 * - API 키는 Firebase 비밀값(ANTHROPIC_API_KEY)에만 있다. 코드와 브라우저에는 없다.
 * - 로그인한 사람만 부를 수 있고, 하루 사용 횟수를 센다. */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { organizePrompt, feedbackPrompt } = require("./prompts");

admin.initializeApp();
const db = admin.firestore();
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

/* 모델: 정리는 정확도 우선, 피드백은 빠르고 싸게. 바꾸면 docs/decisions.md 에 기록. */
const MODEL = { organize: "claude-sonnet-5-5", feedback: "claude-haiku-5-5" };
/* 하루 사용 한도 (사람당). 파일럿 비용 관리용. */
const DAILY_LIMIT = { organize: 20, feedback: 40 };

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
  const text = (data.content || []).map((c) => c.text || "").join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new HttpsError("internal", "AI 응답 형식이 맞지 않습니다.");
  try { return JSON.parse(m[0]); } catch (e) { throw new HttpsError("internal", "AI 응답을 읽지 못했습니다."); }
}

async function countUse(uid, task) {
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
  const ref = db.doc(`usage/${uid}_${day}`);
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const n = (snap.exists && snap.data()[task]) || 0;
    if (n >= DAILY_LIMIT[task]) throw new HttpsError("resource-exhausted", "오늘 사용 한도를 넘었습니다.");
    t.set(ref, { uid, day, [task]: n + 1 }, { merge: true });
  });
}

exports.ai = onCall({ secrets: [ANTHROPIC_API_KEY], region: "asia-northeast3", timeoutSeconds: 120 }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const d = req.data || {};
  if (d.task === "organize") {
    const text = String(d.text || "").slice(0, 12000);
    if (text.length < 20) throw new HttpsError("invalid-argument", "레슨 내용이 너무 짧습니다.");
    await countUse(req.auth.uid, "organize");
    const libSnap = await db.collection("library").where("status", "==", "active").get();
    const lib = libSnap.docs.map((x) => ({ id: x.id, ...x.data() }));
    return callClaude(MODEL.organize, organizePrompt({
      text, coach: String(d.coach || "").slice(0, 40), profile: d.profile || {}, history: (d.history || []).slice(0, 3), lib,
    }), 4000);
  }
  if (d.task === "feedback") {
    await countUse(req.auth.uid, "feedback");
    return callClaude(MODEL.feedback, feedbackPrompt({
      lesson: d.lesson || {}, verdict: String(d.verdict || ""), text: String(d.text || "").slice(0, 300),
    }), 800);
  }
  throw new HttpsError("invalid-argument", "알 수 없는 요청입니다.");
});
