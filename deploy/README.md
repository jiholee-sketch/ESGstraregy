# ESG 중장기전략 진척관리 — Google Cloud 배포

프로젝트 `ai-crew-9-common` 의 **Firebase Hosting + Firestore** 로 올린다.
Firebase 프로젝트는 Google Cloud 프로젝트와 같은 것이다. 콘솔만 두 개일 뿐,
결제·권한·리소스는 하나로 묶여 있다.

배포 후 주소는 `https://ai-crew-9-common.web.app` 이 된다.

---

## 지금 상태

| | |
|---|---|
| 코드 포팅 | **끝** — Claude 저장소 → Firestore |
| 배포 설정 | **끝** — 규칙·호스팅·빌드 스크립트 |
| 화면 확인 | **끝** — 로컬에서 실제 데이터로 렌더링 확인 |
| 실제 배포 | **대기** — `firebase login` 은 담당자 계정으로 직접 해야 한다 |

로그인은 브라우저가 열리는 구글 계정 인증이라 대신 해 줄 수 없다.
아래 1번만 직접 하면 나머지는 스크립트가 처리한다.

---

## 배포 순서

작업 폴더는 이 `deploy` 폴더다.

### 1. 로그인 (직접)

```bash
cd deploy && npm run login
```

브라우저가 열린다. `ai-crew-9-common` 에 접근 권한이 있는 구글 계정으로 로그인한다.

### 2. 프로젝트 준비

```bash
cd deploy && npm run setup
```

없는 것만 만든다. 여러 번 돌려도 안전하다.

- Firestore 데이터베이스 — 없으면 **서울(asia-northeast3)** 리전에 생성
- 웹 앱 등록 — 없으면 생성
- 이미 쓰고 있는 호스팅이 있는지 확인

### 3. 익명 로그인 켜기 (직접, 한 번만)

[콘솔 > Authentication > Sign-in method](https://console.firebase.google.com/project/ai-crew-9-common/authentication/providers)
에서 **익명(Anonymous)** 을 사용 설정한다.

이걸 빠뜨리면 화면은 뜨는데 저장이 안 된다. 왜 필요한지는 아래 "보안" 참고.

### 4. 임시 주소로 먼저 확인

```bash
cd deploy && npm run preview
```

7일 뒤 자동으로 사라지는 임시 주소가 나온다. 실제 주소는 건드리지 않는다.
**공용 프로젝트이므로 이 단계를 건너뛰지 않기를 권한다.**

### 5. 실제 배포

```bash
cd deploy && npm run deploy
```

빌드 → 보안 규칙 → 사이트 순으로 올라간다. 끝나면 주소가 출력된다.

### 6. 예시 데이터 넣기 (선택)

```bash
cd deploy && npm run seed
```

`data/` 의 97건(계열사 9 · 사업장 5 · 팀 31 · 과제 26 · 실적 25 · 마감일 1)을 넣는다.
**이미 있는 문서는 건드리지 않는다.** 먼저 `npm run seed:dry` 로 무엇이 들어갈지 볼 수 있다.

> 이 데이터는 예시다. 실제 운영 전에 지워야 한다.

---

## 명령 목록

| 명령 | 하는 일 |
|---|---|
| `npm run login` | firebase 로그인 (브라우저) |
| `npm run setup` | 프로젝트 준비 상태 확인·생성 |
| `npm run build` | 원본 HTML → `public/` 배포본 생성 |
| `npm run preview` | 임시 주소로 배포 (7일) |
| `npm run deploy` | 빌드 + 규칙 + 사이트 배포 |
| `npm run deploy:rules` | 보안 규칙만 배포 |
| `npm run seed` | 예시 데이터 넣기 (없는 것만) |
| `npm run seed:dry` | 넣지 않고 목록만 보기 |
| `node localtest.js` | 로컬에서 화면만 확인 (가짜 저장소) |

---

## 조직 계층

```
그룹사
 └ 계열사            companies
    └ 사업장·본부     sites      (companyId)   ← 없으면 건너뛸 수 있다
       └ 팀          teams      (siteId · companyId)
          └ 실행과제  strategies (teamId · siteId · companyId · category)
```

중간 층이 없는 계열사는 사업장을 비우면 팀이 **계열사 직속**으로 달린다(해외법인 등).
과제의 `siteId` · `companyId` 는 **등록 시점에 굳힌 값**이다 — 팀이 나중에 다른
조직으로 옮겨가도 과거 과제와 분기 실적이 소급 이동하지 않는다.

`category` 는 팀을 가로지르는 주제 축으로, 값은 앱의 `CATS` 한 곳에서만 정의한다
(`환경·기후` · `인권·노동` · `안전보건` · `공급망` · `공시·규제 대응`). 비워 두면
**분류 미지정**으로 따로 집계되어 그룹사 화면에 표시된다.

---

## 원본은 하나다

배포본을 따로 고치지 않는다. 화면이나 기능을 바꿀 때는 **원본** 을 고친다.

```
../esg-strategy-tracker.html     ← 여기만 고친다
        │  node build.js
        ▼
   public/index.html             ← 자동 생성. 직접 고치지 않는다.
```

`npm run deploy` 가 빌드를 먼저 돌리므로, 원본만 고치고 배포하면 된다.

### 빌드가 바꾸는 것 — 네 군데뿐

| | Claude Artifact | Firebase |
|---|---|---|
| 문서 | 조각 HTML | `DOCTYPE`·`charset`·`viewport` 추가 |
| 저장소 | `claude.use("db")` | Firestore |
| 내려받기 | `claude.use("downloads")` | 브라우저 Blob 다운로드 |
| 오류 코드 | `invalid_argument` 등 | `permission-denied` 등 (양쪽 모두 인식) |

`doc()` `collection()` `onSnapshot()` 의 모양이 Claude 저장소와 Firestore가 같아서,
집계·화면·입력 로직 2,400줄은 **한 줄도 바뀌지 않았다.**

---

## 보안 — 지금 설정과 한계

`firestore.rules` 는 **익명 로그인을 마친 브라우저만** 읽고 쓰게 한다.
여는 컬렉션은 `companies` · `sites` · `teams` · `strategies` · `progress` · `deadlines` · `system` 일곱 개뿐이다.

담당자에게 로그인 화면은 보이지 않는다. 페이지를 열면 앱이 알아서 익명 로그인을 한다.
입력 부담은 그대로 0이다.

**막는 것** — 주소만 알고 들어오는 외부 스크립트, 임의 컬렉션 생성

**못 막는 것** — 주소를 아는 **사람**. 열람자와 담당자가 구분되지 않는다.
URL을 아는 누구나 과제를 고치거나 지울 수 있다.

사내망 밖에 공개되는 주소라 이 차이가 중요하다. 구분이 필요하면
`firestore.rules` 아래쪽의 "나중에" 주석에 바꾸는 법을 적어 두었다.
앱은 이미 준비돼 있다 — 시작할 때 쓰기를 한 번 시도해 보고 거부당하면
수정 버튼을 숨긴다. **규칙만 바꾸면 화면이 따라온다.**

---

## 비용

Firebase 무료 한도 안에서 충분하다.

| | 무료 한도(일) | 예상 사용 |
|---|---|---|
| Firestore 읽기 | 50,000 | 30개 팀 × 하루 몇 번 열람 |
| Firestore 쓰기 | 20,000 | 분기당 30건 남짓 |
| 호스팅 전송 | 10GB/월 | 한 사람당 약 800KB |

분기에 한 번 입력하는 시스템이라 자릿수가 다르다.
다만 `ai-crew-9-common` 이 공용 프로젝트라면 **다른 팀 사용량과 합산**된다.

---

## 폴더 구성

```
deploy/
  README.md              이 문서
  package.json           명령 모음
  .firebaserc            프로젝트 ID (ai-crew-9-common)
  firebase.json          호스팅·캐시·보안 헤더
  firestore.rules        보안 규칙
  firestore.indexes.json 색인 (앱이 서버 정렬을 안 써서 비어 있음)

  build.js               원본 → 배포본 변환
  setup.js               프로젝트 준비
  seed.js                예시 데이터 넣기
  localtest.js           로컬 화면 확인

  data/                  예시 데이터 97건 (폴더 이름 = 컬렉션)
  public/                배포본 (자동 생성)
  node_modules/          Firebase SDK · CLI
```

---

## 막혔을 때

**화면은 뜨는데 "저장소 접근 권한을 받지 못했습니다"**
→ 3번(익명 로그인)을 안 켰다.

**"Firebase 프로젝트 설정을 찾지 못했습니다"**
→ `public/index.html` 을 파일로 직접 열었다. 배포된 주소로 열어야 한다.
로컬에서 보려면 `node localtest.js`.

**저장할 때 "보기 전용 권한으로는 저장할 수 없습니다"**
→ 보안 규칙이 안 올라갔다. `npm run deploy:rules`.

**`npm run setup` 이 Firestore API 얘기를 한다**
→ 안내된 주소에서 API를 켜고 1~2분 뒤 다시 실행한다.

**Datastore 모드라고 나온다**
→ 이 프로젝트의 Firestore가 다른 모드로 이미 만들어져 있다. 모드는 바꿀 수 없다.
IT와 상의해야 한다.
