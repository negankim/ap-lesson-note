# AP 크루 걷기 그림 규격 (2026-11-17)

광장에서 크루 4명이 실제로 걷는 모습을 보여 주기 위한 그림 규격입니다. 앱은 이미 준비되어 있어서, 그림이 들어오면 바로 걷습니다(그림이 없으면 지금처럼 이동 + 흔들림).

## 무엇을 만드나

| 항목 | 내용 |
|---|---|
| 캐릭터 | 로건(늑대) · 루크(까마귀) · 데릴(오소리) · 파코(카멜레온) |
| 방향 | **오른쪽으로 걷기**, **왼쪽으로 걷기** 두 가지. 좌우 반전으로 만들지 않고 따로 그린다(모자 AP 모노그램이 거꾸로 되면 안 됨) |
| 장 수 | 방향마다 **8장**(걷기 한 바퀴). 8번째 다음 1번째로 자연스럽게 이어져야 한다 |
| 합계 | 4명 × 2방향 × 8장 = **64장** |

## 그림 조건

- **기준 그림:** 지금 쓰는 `img/crew3d/{이름}-idle.webp` 와 같은 캐릭터·옷(베이지 폴로, 갈색 벨트, 다크 브라운 바지, 갈색 구두, 다크 그린 캡 + AP 모노그램)·조명·질감·렌더링 느낌.
- **시점:** 지금처럼 살짝 위에서 본 3/4 시점. 몸은 걷는 방향을 향하고 얼굴은 약간 보는 사람 쪽.
- **크기·위치:** 한 장 600×1000px(가로:세로 = 3:5), **배경 투명**. 발바닥 위치가 모든 장에서 같은 높이(아래에서 약 40px), 캐릭터 크기·가운데 위치가 장마다 흔들리지 않게.
- **동작:** 다리 교차 + 반대쪽 팔 흔들기, 머리 위아래 움직임은 작게. 꼬리(로건·데릴·파코)와 날개깃(루크)은 걸음에 맞춰 살짝 따라 움직인다.
- **모노그램:** 두 방향 모두 모자 AP 글자가 바르게 읽혀야 한다.
- **피할 것:** 바닥 그림자 넣기(앱에서 넣음), 배경, 글자, 소품, 장마다 다른 얼굴·옷 색.

## 가장 쉬운 제작 방법: 한 줄 시트

8장을 따로 뽑으면 장마다 얼굴과 옷이 달라지기 쉬워서, **한 장에 8단계를 가로로 나란히** 그리는 시트로 만드는 것이 좋습니다.

- 시트 크기: 4800×1000px(600px 칸 8개), 배경 투명 또는 단색.
- 캐릭터마다 오른쪽 시트 1장 + 왼쪽 시트 1장 = 총 8장.
- 시트를 주시면 칸 나누기, 배경 제거, 발 높이·크기 맞춤, 모노그램 확인은 Claude가 한다.

### Codex 요청문 (기준 그림을 함께 첨부)

> Using the attached character as the exact reference (same face, fur/feathers/skin, outfit: beige polo shirt, brown belt with gold buckle, dark brown trousers, brown shoes, dark green flat cap with the "AP" monogram exactly as shown, same 3D render style and lighting), create a horizontal sprite sheet of a **walk cycle with 8 frames**, the character walking **to the right** (three-quarter view, slightly from above, face turned a little toward the viewer). Canvas 4800×1000 px, eight equal 600×1000 cells, one frame per cell, transparent background. Keep the character the same size and centered in every cell, feet on the same baseline about 40 px above the bottom. Frames: 1 contact (right foot forward), 2 down, 3 passing, 4 up, 5 contact (left foot forward), 6 down, 7 passing, 8 up — looping smoothly back to frame 1. Arms swing opposite to legs; tail follows the step slightly. No shadow, no ground, no text, no props. The "AP" monogram on the cap must read correctly (not mirrored).

왼쪽 시트는 마지막 부분만 바꿔서 요청합니다: `walking **to the left**` … `(The character is facing left; draw it facing left — do not mirror the image; the "AP" monogram must still read correctly.)`

캐릭터별로 첫 문장의 기준 그림만 바꾸면 됩니다(로건·루크·데릴·파코의 idle 그림).

## 받은 뒤 처리 (Claude)

1. 칸 나누기 → 배경 제거 → 발 높이·크기·가운데 맞춤 → 모노그램이 바르게 보이는지 확인(필요하면 원본 모노그램으로 교체).
2. `public/img/crew3d/walk/{id}-walk-{right|left}-{01..08}.webp` 로 저장, `manifest.json` 에 캐릭터와 장 수를 적는다.
3. 광장에서 걷는 방향에 맞춰 오른쪽·왼쪽 그림을 0.11초 간격으로 넘긴다. 멈추면 대기 그림, 누르면 그 자리에서 멈춘다.

캐릭터 한 명분만 먼저 와도 그 캐릭터부터 걷기 시작하고, 나머지는 지금처럼 움직입니다.
