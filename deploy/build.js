/* ============================================================
   ESG 중장기전략 진척관리 — Firebase Hosting 배포 빌드
   ------------------------------------------------------------
   원본  : ../esg-strategy-tracker.html   (Claude Artifact용)
   산출물: public/index.html               (Firebase Hosting용)

   원본은 그대로 두고 이 스크립트가 차이만 바꿔 넣는다.
   원본을 고친 뒤 `node build.js`를 다시 돌리면 배포본이 갱신된다.

   바꾸는 것은 네 군데뿐이다.
     1) 독립 HTML 문서로 감싸기 (DOCTYPE·charset·viewport — Artifact에는 없던 것)
     2) 저장소   claude.use("db")        → Firebase Firestore
     3) 내려받기 claude.use("downloads") → 브라우저 Blob 다운로드
     4) 오류 코드 Claude db 코드 → Firestore 코드 (양쪽 모두 인식)
   ============================================================ */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SRC = path.join(ROOT, "..", "esg-strategy-tracker.html");
const OUT_DIR = path.join(ROOT, "public");
const OUT = path.join(OUT_DIR, "index.html");
const VENDOR = path.join(OUT_DIR, "vendor");

const missed = [];
function put(src, from, to, label) {
  if (!src.includes(from)) { missed.push(label); return src; }
  return src.replace(from, to);
}

let s = fs.readFileSync(SRC, "utf8");

/* ── 2) 저장소: Claude db → Firestore ───────────────────────── */
s = put(s,
`/* ============================ db ============================ */
(async function boot() {
  render();
  let db = null;
  try { db = await claude.use("db"); } catch (e) { db = null; }
  if (!db) { state.dbFailed = true; state.ready = true; render(); return; }`,
`/* ============================ db (Firebase Firestore) ============================ */
/* Claude db와 Firestore는 doc()/collection()/onSnapshot() 모양이 같다.
   그래서 아래 이후의 코드는 한 줄도 바뀌지 않는다. 연결 방식만 다르다. */
async function initFirebase() {
  if (typeof firebase === "undefined")
    throw Object.assign(new Error("Firebase SDK 로드 실패"), { esg: "sdk" });

  /* 설정은 Firebase Hosting이 /__/firebase/init.js 로 자동 주입한다.
     다른 곳에 올릴 때만 firebase-config.js 가 대신 채운다. */
  if (!firebase.apps.length) {
    const cfg = window.__ESG_FIREBASE_CONFIG;
    if (!cfg || !cfg.projectId)
      throw Object.assign(new Error("Firebase 프로젝트 설정 없음"), { esg: "config" });
    firebase.initializeApp(cfg);
  }

  /* 익명 로그인 — 로그인 화면은 없다. 담당자는 아무것도 입력하지 않는다.
     보안 규칙이 '로그인한 브라우저만 쓰기'를 요구하므로 외부 스크립트는 막힌다. */
  try {
    await firebase.auth().signInAnonymously();
  } catch (e) {
    state.authError = (e && e.code) || "unknown";
    console.warn("[ESG] 익명 로그인 실패 — Firebase 콘솔에서 Authentication > 익명 로그인을 켜 주세요.", e);
  }

  const store = firebase.firestore();
  /* 폼에서 빈 항목이 undefined로 올 때 Firestore가 통째로 거부하지 않도록 한다. */
  try { store.settings({ ignoreUndefinedProperties: true }); } catch (e) {}
  return store;
}

(async function boot() {
  render();
  let db = null;
  try { db = await initFirebase(); }
  catch (e) { db = null; state.bootError = e && e.esg; console.error("[ESG] 저장소 연결 실패", e); }
  if (!db) { state.dbFailed = true; state.ready = true; render(); return; }`,
  "boot → Firestore");

/* 쓰기 권한 탐지 — Firestore는 permission-denied 를 쓴다 */
s = put(s,
  `.catch(e => { state.canEdit = !(e && e.code === "invalid_argument"); })`,
  `.catch(e => { state.canEdit = !(e && (e.code === "permission-denied" || e.code === "invalid_argument")); })`,
  "write probe 코드");

/* 연결 실패 배너 — 원인별로 다르게 안내한다 */
s = put(s,
  `  if (state.dbFailed) h += '<div class="banner">공용 저장소에 연결하지 못했습니다. 지금 입력한 내용은 저장되지 않으니, 페이지를 새로고침한 뒤 다시 시도해 주세요.</div>';`,
  `  if (state.dbFailed) h += '<div class="banner">' + dbFailMsg() + '</div>';`,
  "실패 배너");

s = put(s,
  `/* ============================ render ============================ */`,
`function dbFailMsg() {
  if (state.bootError === "config")
    return "Firebase 프로젝트 설정을 찾지 못했습니다. 이 페이지는 Firebase Hosting 주소로 열어야 합니다.";
  if (state.bootError === "sdk")
    return "저장소 프로그램을 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 새로고침해 주세요.";
  if (state.authError)
    return "저장소 접근 권한을 받지 못했습니다. ESG 사무국에 문의해 주세요. (코드 " + state.authError + ")";
  return "공용 저장소에 연결하지 못했습니다. 지금 입력한 내용은 저장되지 않으니, 페이지를 새로고침한 뒤 다시 시도해 주세요.";
}

/* ============================ render ============================ */`,
  "dbFailMsg 정의");

s = put(s,
  `  db: null, ready: false, dbFailed: false, canEdit: false, probed: false,`,
  `  db: null, ready: false, dbFailed: false, canEdit: false, probed: false, bootError: null, authError: null,`,
  "state 필드");

/* ── 4) 오류 코드: Firestore 코드를 함께 인식 ───────────────── */
s = put(s,
  `  if (e.code === "invalid_argument") return "보기 전용 권한으로는 저장할 수 없습니다. 담당자 권한이 필요하면 ESG 사무국에 요청해 주세요.";
  if (e.code === "quota_exceeded") return "저장 한도에 도달했습니다. 오래된 과제를 정리한 뒤 다시 시도해 주세요.";
  if (e.code === "resource_exhausted") return "요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.";`,
  `  if (e.code === "permission-denied" || e.code === "invalid_argument") return "보기 전용 권한으로는 저장할 수 없습니다. 담당자 권한이 필요하면 ESG 사무국에 요청해 주세요.";
  if (e.code === "quota_exceeded") return "저장 한도에 도달했습니다. 오래된 과제를 정리한 뒤 다시 시도해 주세요.";
  if (e.code === "resource-exhausted" || e.code === "resource_exhausted") return "요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.";
  if (e.code === "unavailable") return "네트워크가 끊겼습니다. 연결이 돌아오면 자동으로 저장됩니다.";
  if (e.code === "not-found") return "대상을 찾지 못했습니다. 다른 사람이 먼저 삭제했을 수 있습니다. 새로고침해 주세요.";
  if (e.code === "unauthenticated") return "저장소 접근 권한이 없습니다. 새로고침한 뒤 다시 시도해 주세요.";`,
  "writeError 코드");

/* ── 3) 내려받기: Claude downloads → 브라우저 Blob ──────────── */
s = put(s,
  `  let dl = null;
  try { dl = await claude.use("downloads"); } catch (e) { dl = null; }
  if (dl) { try { await dl.save({ filename, data }); toast("CSV를 저장했습니다."); return; } catch (e) { } }
  try { await navigator.clipboard.writeText(data); toast("파일 저장을 사용할 수 없어 CSV 내용을 클립보드에 복사했습니다."); }`,
  `  try {
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("CSV를 내려받았습니다."); return;
  } catch (e) { }
  try { await navigator.clipboard.writeText(data); toast("파일 저장을 사용할 수 없어 CSV 내용을 클립보드에 복사했습니다."); }`,
  "CSV 내려받기");

/* ── 모션 라이브러리를 CDN 대신 vendor 로 (D-050) ───────────── */
s = put(s,
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></` + `script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></` + `script>`,
  `<script src="vendor/gsap.min.js"></` + `script>
<script src="vendor/ScrollTrigger.min.js"></` + `script>`,
  "GSAP vendor 경로");

/* ── SDK 스크립트 삽입 (본문 script 바로 앞) ────────────────── */
const SDK = [
  '<!-- Firebase SDK — vendor/ 에 함께 배포한다. 외부 CDN에 의존하지 않는다. -->',
  '<script src="vendor/firebase-app-compat.js"></' + 'script>',
  '<script src="vendor/firebase-auth-compat.js"></' + 'script>',
  '<script src="vendor/firebase-firestore-compat.js"></' + 'script>',
  '<!-- Firebase Hosting이 프로젝트 설정을 자동으로 넣어 준다. 키를 파일에 적어 둘 필요가 없다. -->',
  '<script src="/__/firebase/init.js"></' + 'script>',
  '<!-- Hosting이 아닌 곳에 올릴 때만 쓰는 대체 설정. 없으면 조용히 무시된다. -->',
  '<script src="firebase-config.js"></' + 'script>',
  '<script>',
  ''
].join("\n");

if (!s.includes("\n<script>\n")) missed.push("본문 script 앵커");
s = s.replace("\n<script>\n", "\n" + SDK);

/* ── head 를 닫고 body 를 연다 (Artifact 조각에는 없던 경계) ── */
s = put(s, `</style>\n\n<div class="app">`, `</style>\n</head>\n\n<body>\n<div class="app">`,
  "head/body 경계");

/* ── 1) 독립 HTML 문서로 감싸기 ─────────────────────────────── */
const FAVICON = "data:image/svg+xml,"
  + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text y="26" font-size="26">🌱</text></svg>');

const HEAD = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="description" content="현업부서가 ESG 중장기전략을 등록하고 분기마다 진행도를 입력하면, 팀별·전사 달성률이 자동으로 집계되는 사내 관리 시스템.">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="${FAVICON}">
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, HEAD + s + "\n</body>\n</html>\n", "utf8");

/* ── Firebase SDK 번들을 public/vendor 로 복사 ──────────────── */
const srcSdk = path.join(ROOT, "node_modules", "firebase");
const want = ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-firestore-compat.js"];
let copied = 0;
if (fs.existsSync(srcSdk)) {
  fs.mkdirSync(VENDOR, { recursive: true });
  for (const f of want) {
    const from = path.join(srcSdk, f);
    if (fs.existsSync(from)) { fs.copyFileSync(from, path.join(VENDOR, f)); copied++; }
    else missed.push("SDK 없음: " + f);
  }
} else {
  missed.push("node_modules/firebase 없음 — npm install 먼저");
}

/* GSAP — 배포본은 외부 CDN 을 타지 않는다 */
const srcGsap = path.join(ROOT, "node_modules", "gsap", "dist");
for (const f of ["gsap.min.js", "ScrollTrigger.min.js"]) {
  const from = path.join(srcGsap, f);
  if (fs.existsSync(from)) { fs.mkdirSync(VENDOR, { recursive: true }); fs.copyFileSync(from, path.join(VENDOR, f)); copied++; }
  else missed.push("GSAP 없음: " + f + " — npm install gsap");
}

/* ── 결과 ───────────────────────────────────────────────────── */
const kb = n => (n / 1024).toFixed(0) + "KB";
console.log("public/index.html   " + kb(fs.statSync(OUT).size));
console.log("public/vendor/      SDK " + copied + "개");
if (missed.length) { console.log("\n!! 적용 실패: " + missed.join(" | ")); process.exit(1); }
console.log("\n빌드 완료");
