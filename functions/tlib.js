/* AP Training Library — 레슨노트와 독립된 훈련 데이터 모듈 (쓰기는 서버만)
 *
 * 계층 (엑셀 AP_Global_Training_Library 구조를 따른다)
 *   tl_sources/{SRCxx}     1. Source Library: 출처·URL·수집 방식·사용권(상업 사용 허락 여부)
 *   tl_observed/{OBS-xxxx} 1. 관측 레코드: 공개 제목·링크만(원문 복제 없음), 추정 family·노드 가설·검증 상태
 *   tl_drills/{AP ID}      2. Standard Drill: AP 표준 드릴(초안 포함) — 증상·대안 원인·AP 개입 요약·측정·해석 가드레일·근거·코치 승인
 *   tl_variants/{id}       3. Drill Variant: 같은 family의 강도·조건 변형(거버넌스 R05, 코치 검수 후 추가)
 *   tl_rx/{id}             4. Drill Prescription: 증상·원인 가설 → 드릴 규칙(승인 전 초안)
 *   players/{uid}/tlRx/{id} 5. Training Result: 선수에게 적용한 처방·수행 결과·재평가(덧붙이기만)
 *   tl_meta/{taxonomy|governance|stats|migrations}
 *
 * 원칙
 *   - AP 6-Axis(SWING·PUTTING·SHORT_GAME·COURSE·MENTAL·PHYSICAL)와 Swing Learning Matrix 8 Root는 다른 분류. SWING 이 아닌 Axis 는 노드를 자동으로 달지 않고 교차참조(nodeCrossRef)로만 둔다(R09).
 *   - R8 = Adaptability(상황 적응·해법 재구성). Mastery 는 옛 이름 → 가져올 때 N8 로 옮기고 migrations 에 남긴다.
 *   - R6 Consistency(같은 수행 반복 재현)와 R8 Adaptability(조건이 바뀌어도 필요한 수행 선택·구현)는 평가를 따로(evalType repeat|adapt).
 *   - 근거 단계(evidence): source 원천 자료만 → standardized AP 표준화 → reviewed 코치 검토 → field 현장 적용 → verified 효과 검증.
 *     가져오기는 source 만 만든다(엑셀의 HYPOTHESIS_ONLY·PENDING). 위 단계는 코치가 앱에서, verified 는 관리자만.
 *   - 고칠 때마다 rev+1·history·note. 지우지 않고 status:retired. 재가져오기는 같은 id 로 덮되, 사람이 고친 칸(locked)과 근거·승인은 건드리지 않는다.
 *   - REGISTRY_ONLY 출처의 레코드는 넣지 않는다(R03). 이름으로 원인을 단정하지 않는다(R07). */
const SCHEMA_VER = "tl-1";
const AXES = ["SWING", "PUTTING", "SHORT_GAME", "COURSE", "MENTAL", "PHYSICAL"];
const NODE_NAMES = { N1: "Mental Focus", N2: "Perceived Impact", N3: "Club Face Control & Lever System", N4: "Club Path Control", N5: "Real Impact", N6: "Consistency", N7: "Efficiency", N8: "Adaptability" };
const R8_SUB = ["Shot Selection Range", "Adaptive Decision", "Pressure Execution", "Situation-specific Control", "Intentional Curve Creation", "Strategic Reproduction"];
const EVIDENCE = ["source", "standardized", "reviewed", "field", "verified"];
const APPROVAL = ["PENDING", "APPROVED", "REVISE", "REJECTED"];
const EVAL_TYPES = ["repeat", "adapt", "other"];
const DRILL_TYPES = ["", "TECHNICAL", "GAME", "TEST", "ROUTINE", "EXERCISE"];

const S = (v, n = 400) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim().slice(0, n));
const LIST = (v, n = 20, m = 160) => (Array.isArray(v) ? v : String(v || "").split(/[;\n|]/)).map((x) => S(x, m)).filter(Boolean).slice(0, n);
const NODES = (v) => [...new Set(LIST(v, 8, 10).map((x) => { const m = String(x).match(/^[NR]?([1-8])$/i) || String(x).match(/\b[NR]([1-8])\b/i); return m ? "N" + m[1] : (/mastery|adaptab/i.test(x) ? "N8" : null); }).filter(Boolean))];
const normKey = (s) => S(s, 200).toLowerCase().normalize("NFKC").replace(/\b(the|drill|drills|test|game)\b/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
const ID = (v) => { const s = S(v, 40); return /^[A-Za-z0-9_-]{2,40}$/.test(s) ? s : ""; };

function cleanDrill(d) {
  const axis = AXES.includes(S(d.axis, 20)) ? S(d.axis, 20) : "";
  let nodes = NODES(d.nodes), cross = NODES(d.nodeCrossRef);
  if (axis && axis !== "SWING" && nodes.length) { cross = [...new Set([...cross, ...nodes])]; nodes = []; } // R09
  const r8sub = nodes.includes("N8") ? LIST(d.r8sub, 6, 60).filter((x) => R8_SUB.includes(x)) : [];
  let evalType = S(d.evalType, 10); if (!EVAL_TYPES.includes(evalType)) evalType = nodes.includes("N8") ? "adapt" : nodes.includes("N6") ? "repeat" : "other";
  const dt = S(d.drillType, 12).toUpperCase();
  const cr = d.coachReview || {};
  return {
    nameKo: S(d.nameKo, 120), nameEn: S(d.nameEn, 120), axis, axisSecondary: LIST(d.axisSecondary, 5, 20).filter((x) => AXES.includes(x) && x !== axis),
    nodes, nodeStatus: nodes.length ? (S(d.nodeStatus, 20) || "tentative") : "", nodeCrossRef: cross, r8sub, evalType, drillType: DRILL_TYPES.includes(dt) ? dt : "",
    symptoms: LIST(d.symptoms, 12), hypotheses: LIST(d.hypotheses, 12), conditions: S(d.conditions, 400),
    how: S(d.how, 1200), equipment: LIST(d.equipment, 12, 60), difficulty: Math.max(1, Math.min(5, parseInt(d.difficulty, 10) || 0)) || null,
    dose: S(d.dose, 160), success: S(d.success, 300), metrics: LIST(d.metrics, 10), guardrail: S(d.guardrail, 400),
    sourceExample: S(d.sourceExample, 400), evidenceGrade: S(d.evidenceGrade, 40) || "HYPOTHESIS_ONLY", versionNote: S(d.versionNote, 200),
    draft: d.draft !== false, aliases: LIST(d.aliases, 20, 120),
    coachReview: { status: S(cr.status, 20), reviewer: S(cr.reviewer, 60), date: S(cr.date, 20), mechanics: S(cr.mechanics, 200), indications: S(cr.indications, 300), contraindications: S(cr.contraindications, 300), measureAgreed: S(cr.measureAgreed, 200), fieldPilot: S(cr.fieldPilot, 30), remarks: S(cr.remarks, 300) },
  };
}
function drillProblems(c) {
  const p = [];
  if (!c.nameKo && !c.nameEn) p.push("이름 없음");
  if (!c.how) p.push("수행 방법 없음");
  if (!c.axis) p.push("Axis 없음");
  if (!c.metrics.length && !c.success) p.push("측정 지표 없음(R11: 관측지표 없으면 승인 불가)");
  if (!c.dose) p.push("권장 수행량 없음");
  if (!c.equipment.length) p.push("도구 미기재");
  if (!c.difficulty) p.push("난이도 미기재");
  return p;
}
/* 이름이 거의 같은 항목(사람이 확인하도록 후보로만) */
function bigrams(s) { const k = normKey(s); const o = new Set(); for (let i = 0; i < k.length - 1; i++) o.add(k.slice(i, i + 2)); return o; }
function similar(a, b) { const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach((x) => { if (B.has(x)) n++; }); return (2 * n) / (A.size + B.size); }

async function importBundle(db, b, by) {
  const now = new Date().toISOString(), batch = S(b.batch || now.slice(0, 10), 60);
  const rep = { batch, sources: { added: 0, updated: 0, same: 0 }, observed: { added: 0, updated: 0, same: 0, skippedRegistryOnly: 0, unresolved: 0, ambiguous: 0, linked: 0 }, drills: { added: 0, updated: 0, same: 0, problems: [] }, dupObserved: [], migrations: (b.migrations || []).length };
  const keepOnUpdate = ["evidence", "coachApproval", "approvedBy", "approvedAt", "status", "locked", "dupOf", "r8sub", "evalType"];
  const upsert = async (col, id, data, bucket) => {
    const ref = db.doc(`${col}/${id}`), snap = await ref.get();
    if (!snap.exists) { await ref.set({ ...data, rev: 1, history: [], status: "active", createdAt: now, updatedAt: now, by, batch, schema: SCHEMA_VER }); bucket.added++; return; }
    const old = snap.data(), locked = old.locked || [];
    const next = {}; Object.keys(data).forEach((k) => { if (!locked.includes(k) && !keepOnUpdate.includes(k)) next[k] = data[k]; });
    const changed = Object.keys(next).some((k) => JSON.stringify(next[k]) !== JSON.stringify(old[k]));
    if (!changed) { bucket.same++; return; }
    const prev = {}; Object.keys(next).forEach((k) => { if (JSON.stringify(next[k]) !== JSON.stringify(old[k])) prev[k] = old[k] === undefined ? null : old[k]; });
    await ref.update({ ...next, rev: (old.rev || 1) + 1, history: [...(old.history || []).slice(-19), { rev: old.rev || 1, at: old.updatedAt || null, by: old.by || null, note: old.note || "", prev }], note: `가져오기 ${batch}`, updatedAt: now, by, batch });
    bucket.updated++;
  };
  const regOnly = new Set();
  for (const s of b.sources || []) {
    const id = ID(s.id); if (!id) continue;
    if (s.capturePolicy === "REGISTRY_ONLY") regOnly.add(id);
    let lic = S(s.license, 20); if (!["unknown", "permitted", "restricted", "own"].includes(lic)) lic = "unknown";
    await upsert("tl_sources", id, { title: S(s.title, 200), publisher: S(s.publisher, 120), url: S(s.url, 400), listed: S(s.listed, 20), focus: S(s.focus, 120), capturePolicy: S(s.capturePolicy, 30), lang: S(s.lang, 20), license: lic, licenseNote: S(s.licenseNote, 300), checkedOn: S(s.checkedOn, 20), clearance: S(s.clearance, 40) }, rep.sources);
  }
  const drillIds = new Set((b.drills || []).map((d) => ID(d.id)).filter(Boolean));
  const obs = [];
  for (const o of b.observed || []) {
    const id = ID(o.id); if (!id) continue;
    if (regOnly.has(o.source)) { rep.observed.skippedRegistryOnly++; continue; } // R03
    if (!S(o.url) || !S(o.source)) continue;                                      // R01: 출처·URL 없으면 넣지 않음
    const fam = S(o.family, 40);
    if (fam === "UNRESOLVED") rep.observed.unresolved++; else if (fam === "FAMILY_AMBIGUOUS") rep.observed.ambiguous++; else if (drillIds.has(fam)) rep.observed.linked++;
    const data = { source: S(o.source, 20), title: S(o.title, 160), axis: AXES.includes(o.axis) ? o.axis : "", depth: S(o.depth, 30), url: S(o.url, 400), family: fam, mergeNote: S(o.mergeNote, 200), nodes: NODES(o.nodes), nodeCrossRef: NODES(o.nodeCrossRef), nodeText: S(o.nodeText, 80), coachVerification: S(o.coachVerification, 40), reusePolicy: S(o.reusePolicy, 30), mapConfidence: S(o.mapConfidence, 30), observedOn: S(o.observedOn, 20), recordType: S(o.recordType, 40), remarks: S(o.remarks, 300) };
    obs.push({ id, ...data });
    await upsert("tl_observed", id, data, rep.observed);
  }
  for (const d of b.drills || []) {
    const id = ID(d.id); if (!id) continue;
    const c = cleanDrill(d);
    c.observed = obs.filter((o) => o.family === id).map((o) => o.id);
    c.aliases = [...new Set([...c.aliases, ...obs.filter((o) => o.family === id).map((o) => o.title)])].slice(0, 30);
    const probs = drillProblems(c); if (probs.length) rep.drills.problems.push({ id, name: c.nameKo || c.nameEn, problems: probs });
    await upsert("tl_drills", id, c, rep.drills);
    const s = await db.doc(`tl_drills/${id}`).get();
    const cur = s.data(); const fix = {};
    if (!cur.evidence) fix.evidence = "source";
    if (!cur.coachApproval) fix.coachApproval = APPROVAL.includes(d.coachApproval) ? d.coachApproval : "PENDING";
    if (Object.keys(fix).length) await db.doc(`tl_drills/${id}`).update(fix);
  }
  // 아직 family 가 정해지지 않은 관측 제목끼리 거의 같은 것(병합 검토 후보)
  const open = obs.filter((o) => !drillIds.has(o.family));
  for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) {
    const ka = normKey(open[i].title), kb = normKey(open[j].title);
    const contains = Math.min(ka.length, kb.length) >= 4 && (ka.includes(kb) || kb.includes(ka));
    const sc = contains ? Math.max(0.9, similar(open[i].title, open[j].title)) : similar(open[i].title, open[j].title);
    if (sc >= 0.66) rep.dupObserved.push({ a: open[i].id, b: open[j].id, at: open[i].title, bt: open[j].title, score: Math.round(sc * 100) / 100 });
  }
  if (b.taxonomy) await db.doc("tl_meta/taxonomy").set({ ...b.taxonomy, updatedAt: now, batch });
  if (b.governance) await db.doc("tl_meta/governance").set({ rules: b.governance, updatedAt: now, batch });
  if ((b.migrations || []).length) await db.doc("tl_meta/migrations").set({ [batch.replace(/[^\w-]/g, "_")]: { at: now, by, items: b.migrations } }, { merge: true });
  const total = (await db.collection("tl_drills").get()).size, totalObs = (await db.collection("tl_observed").get()).size;
  await db.doc("tl_meta/stats").set({ drills: total, observed: totalObs, schema: SCHEMA_VER, lastImport: { at: now, by, batch, report: { ...rep, dupObserved: rep.dupObserved.slice(0, 60) } } }, { merge: true });
  return rep;
}

/* 코치·관리자 편집: 버전 올리고 이전 내용 보존, 사람이 고친 칸은 locked */
async function editDrill(db, id, patch, { by, role, note }) {
  if (!S(note, 200)) throw new Error("note-required");
  const ref = db.doc(`tl_drills/${id}`), snap = await ref.get();
  if (!snap.exists) throw new Error("not-found");
  const old = snap.data(), now = new Date().toISOString();
  const editable = ["nameKo", "nameEn", "axisSecondary", "nodes", "nodeStatus", "r8sub", "evalType", "drillType", "symptoms", "hypotheses", "conditions", "how", "equipment", "difficulty", "dose", "success", "metrics", "guardrail", "aliases", "coachReview"];
  const c = cleanDrill({ ...old, ...patch, coachReview: { ...(old.coachReview || {}), ...(patch.coachReview || {}) } });
  const next = {}; editable.forEach((k) => { if (patch[k] !== undefined && JSON.stringify(c[k]) !== JSON.stringify(old[k])) next[k] = c[k]; });
  if (patch.evidence !== undefined) {
    const ev = EVIDENCE.includes(patch.evidence) ? patch.evidence : old.evidence;
    if (ev === "verified" && role !== "admin") throw new Error("admin-only");
    if (EVIDENCE.indexOf(ev) >= 2 && !(c.metrics.length || c.success)) throw new Error("metric-required"); // R11
    if (ev !== old.evidence) next.evidence = ev;
  }
  if (patch.coachApproval !== undefined && APPROVAL.includes(patch.coachApproval) && patch.coachApproval !== old.coachApproval) {
    if (patch.coachApproval === "APPROVED" && !(c.metrics.length || c.success)) throw new Error("metric-required");
    next.coachApproval = patch.coachApproval;
    next.coachReview = { ...(c.coachReview || {}), status: patch.coachApproval, reviewer: (c.coachReview && c.coachReview.reviewer) || by, date: now.slice(0, 10) };
    if (patch.coachApproval === "APPROVED") { next.approvedBy = by; next.approvedAt = now; if (EVIDENCE.indexOf(next.evidence || old.evidence) < 2) next.evidence = "reviewed"; }
  }
  if (patch.status && ["active", "retired"].includes(patch.status) && patch.status !== old.status) next.status = patch.status;
  if (patch.dupOf !== undefined) next.dupOf = ID(patch.dupOf) || null;
  if (!Object.keys(next).length) return { rev: old.rev || 1, changed: false };
  const prev = {}; Object.keys(next).forEach((k) => { prev[k] = old[k] === undefined ? null : old[k]; });
  const locked = [...new Set([...(old.locked || []), ...Object.keys(next).filter((k) => editable.includes(k))])];
  await ref.update({ ...next, locked, rev: (old.rev || 1) + 1, history: [...(old.history || []).slice(-29), { rev: old.rev || 1, at: old.updatedAt || null, by: old.by || null, note: old.note || "", prev }], note: S(note, 200), by, updatedAt: now });
  return { rev: (old.rev || 1) + 1, changed: true };
}

/* 관측 레코드 → 표준 드릴 연결(family 지정) 또는 보류 */
async function linkObserved(db, id, family, { by, note }) {
  const ref = db.doc(`tl_observed/${id}`), snap = await ref.get();
  if (!snap.exists) throw new Error("not-found");
  const fam = S(family, 40);
  if (fam !== "UNRESOLVED" && fam !== "FAMILY_AMBIGUOUS" && !(await db.doc(`tl_drills/${fam}`).get()).exists) throw new Error("not-found");
  const old = snap.data(), now = new Date().toISOString();
  await ref.update({ family: fam, mergeNote: S(note, 200) || old.mergeNote || "", locked: [...new Set([...(old.locked || []), "family", "mergeNote"])], rev: (old.rev || 1) + 1, history: [...(old.history || []).slice(-19), { rev: old.rev || 1, at: old.updatedAt || null, prev: { family: old.family, mergeNote: old.mergeNote } }], updatedAt: now, by });
  return { ok: true };
}

module.exports = { SCHEMA_VER, AXES, NODE_NAMES, R8_SUB, EVIDENCE, APPROVAL, cleanDrill, drillProblems, similar, normKey, importBundle, editDrill, linkObserved };
