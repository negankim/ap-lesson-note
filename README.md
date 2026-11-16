# AP 레슨 노트

받은 레슨을 말하거나 적으면 AP Swing Learning Matrix 기준으로 **문제 · Matrix 위치 · 레슨 정리 · 솔루션 · 훈련 방안 · 6일 배틀플랜**을 만들고, 연습 후 반응에 맞춰 다음 연습을 조정하는 웹 앱입니다. 코치진은 **훈련 라이브러리**를 계속 고치고 늘리며, 모든 변경은 버전과 이유가 남고 되돌릴 수 있습니다.

(주)에이피골프 · AP Legacy System · 대외비

## 구성

| 폴더 | 내용 |
|---|---|
| `public/` | 화면 (HTML·CSS·JS, 빌드 없음). `app.js` 화면 로직, `services.js` 로그인·DB·AI·음성 연결 |
| `functions/` | 서버 함수 `ai` — Claude API 호출. **프롬프트와 판정 규칙은 여기에만 있음** (`prompts.js`) |
| `firestore.rules` | 데이터 접근 규칙 (선수는 본인 기록만, 코치·관리자는 전체 열람과 라이브러리 수정) |
| `scripts/` | 훈련 라이브러리 첫 데이터 85개와 넣는 스크립트 |
| `docs/decisions.md` | 무엇을 왜 바꿨는지 기록 |

## 처음 설정 (대표님이 한 번만)

준비물: Google 계정, Anthropic API 키, 컴퓨터에 Node.js 20 이상.

1. **Firebase 프로젝트** — `ap-lesson-note` 생성 완료 (2026-11-16). 요금제를 **Blaze(종량제)** 로 올려야 서버 함수를 쓸 수 있습니다 (파일럿 규모에서는 거의 무료).
2. Google 로그인 사용 설정, Firestore(서울 `asia-northeast3`) 생성 완료.
3. 프로젝트 ID는 `ap-lesson-note` 로 이미 설정되어 있습니다.
4. 컴퓨터 터미널에서:
   ```bash
   npm install -g firebase-tools
   firebase login
   cd ap-lesson-note
   firebase functions:secrets:set ANTHROPIC_API_KEY   # 프롬프트가 나오면 키를 붙여 넣기 (화면에 안 보임)
   cd functions && npm install && cd ..
   firebase deploy
   ```
5. 배포가 끝나면 나오는 주소(`https://프로젝트ID.web.app`)로 접속해 Google로 로그인합니다.
6. **역할 지정** — Firestore 콘솔의 `users/{내 uid}` 문서에서 `role` 을 `admin` 으로 바꿉니다. 코치는 `coach`. (선수는 처음 로그인하면 자동으로 `player`)
7. **라이브러리 넣기** — 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 → `service-account.json` 으로 저장(절대 저장소에 올리지 않음, `.gitignore` 에 있음):
   ```bash
   cd scripts && npm install firebase-admin
   GOOGLE_APPLICATION_CREDENTIALS=../service-account.json node seed-library.js
   ```

API 키, 서비스 계정 파일은 **코드나 채팅에 붙여 넣지 마세요.** 위 명령으로 Firebase에만 저장됩니다.

## 비용 관리

- 사람당 하루 정리 20회 · 피드백 40회 한도 (`functions/index.js` 의 `DAILY_LIMIT`).
- 레슨 정리는 Sonnet, 피드백은 Haiku 모델 (`MODEL`). 바꾸면 `docs/decisions.md` 에 기록.

## 앱으로 내기 (3단계)

웹이 안정되면 Capacitor로 같은 코드를 iOS·안드로이드 앱으로 감쌉니다. Apple 개발자 계정(연 $99) 필요.
