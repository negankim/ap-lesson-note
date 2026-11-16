/* 훈련 라이브러리 첫 데이터 넣기 (한 번만 실행)
 * 사용: cd scripts && npm i firebase-admin && \
 *       GOOGLE_APPLICATION_CREDENTIALS=../service-account.json node seed-library.js
 * 이미 있는 항목은 건너뛴다 — 코치진이 고친 내용을 덮어쓰지 않는다. */
const admin = require("firebase-admin");
const items = require("./library-seed.json");
admin.initializeApp();
const db = admin.firestore();
(async () => {
  let added = 0, skipped = 0;
  for (const [id, data] of Object.entries(items)) {
    const ref = db.doc("library/" + id);
    if ((await ref.get()).exists) { skipped++; continue; }
    await ref.set(data); added++;
  }
  console.log(`추가 ${added}개 · 이미 있어 건너뜀 ${skipped}개`);
})();
