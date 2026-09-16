/* ============================================================
   ESG 중장기전략 진척관리 — 초기 데이터 넣기
   ------------------------------------------------------------
   data/ 아래의 JSON을 Firestore로 옮긴다.
   폴더 이름이 컬렉션, 파일 이름이 문서 ID가 된다.

     data/sites/st-hq.json  →  sites/st-hq

   기본 동작은 '없는 것만 추가'다. 이미 있는 문서는 건드리지 않는다.
   담당자가 입력한 실적을 덮어쓰지 않기 위해서다.

     node seed.js              없는 문서만 추가 (안전)
     node seed.js --dry-run    무엇이 들어갈지 보기만 한다
     node seed.js --overwrite  같은 ID가 있어도 덮어쓴다 (되돌릴 수 없음)

   자격증명은 따로 필요 없다. firebase CLI 로그인 정보로 프로젝트
   설정을 읽고, 앱과 똑같이 익명 로그인해서 쓴다.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const { initializeApp } = require("firebase/app");
const { getAuth, signInAnonymously } = require("firebase/auth");
const { getFirestore, doc, getDoc, writeBatch } = require("firebase/firestore");

const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const ARGS = process.argv.slice(2);
const DRY = ARGS.includes("--dry-run");
const OVERWRITE = ARGS.includes("--overwrite");

/* ── firebase CLI에서 이 프로젝트의 웹 설정을 받아온다 ──────── */
function sdkConfig() {
  /* .cmd 래퍼 대신 CLI 본체를 node로 직접 돌린다 (윈도우 .cmd 실행 제한 회피) */
  const cli = path.join(ROOT, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
  let raw;
  try {
    raw = execFileSync(process.execPath, [cli, "apps:sdkconfig", "WEB", "--json"], {
      cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const out = String((e.stdout || "") + (e.stderr || ""));
    if (/No apps/i.test(out) || /not found/i.test(out)) {
      die("이 프로젝트에 웹 앱이 없습니다.\n   먼저 실행하세요:  npm run setup");
    }
    if (/login/i.test(out)) die("firebase 로그인이 필요합니다.\n   먼저 실행하세요:  npm run login");
    die("프로젝트 설정을 읽지 못했습니다.\n" + out.trim().slice(0, 600));
  }
  const j = JSON.parse(raw);
  const cfg = (j.result && (j.result.sdkConfig || j.result)) || j.sdkConfig || j;
  if (!cfg || !cfg.projectId) die("프로젝트 설정 형식을 알 수 없습니다.\n" + raw.slice(0, 400));
  return cfg;
}

function die(msg) { console.error("\n오류 — " + msg + "\n"); process.exit(1); }

/* ── data/ 훑기 ─────────────────────────────────────────────── */
function collect() {
  if (!fs.existsSync(DATA)) die("data 폴더가 없습니다: " + DATA);
  const out = [];
  for (const col of fs.readdirSync(DATA)) {
    const dir = path.join(DATA, col);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const body = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      out.push({ col, id: path.basename(f, ".json"), body });
    }
  }
  return out.sort((a, b) => (a.col + a.id).localeCompare(b.col + b.id));
}

/* ── 실행 ───────────────────────────────────────────────────── */
(async function main() {
  const docs = collect();
  const byCol = docs.reduce((m, d) => (m[d.col] = (m[d.col] || 0) + 1, m), {});
  console.log("data 폴더 — " + Object.entries(byCol).map(([k, v]) => k + " " + v).join(", ")
    + "  (모두 " + docs.length + "건)");

  const cfg = sdkConfig();
  console.log("프로젝트 — " + cfg.projectId);

  if (DRY) {
    console.log("\n--dry-run 이므로 아무것도 쓰지 않습니다. 들어갈 문서:");
    for (const d of docs) console.log("  " + d.col + "/" + d.id);
    return;
  }

  const app = initializeApp(cfg);
  try {
    await signInAnonymously(getAuth(app));
  } catch (e) {
    die("익명 로그인에 실패했습니다. (" + (e.code || e.message) + ")\n"
      + "   Firebase 콘솔 > Authentication > Sign-in method 에서 '익명'을 켜 주세요.\n"
      + "   https://console.firebase.google.com/project/" + cfg.projectId + "/authentication/providers");
  }
  const db = getFirestore(app);

  /* 이미 있는 문서 걸러내기 */
  const todo = [];
  let skipped = 0;
  for (const d of docs) {
    if (!OVERWRITE) {
      const snap = await getDoc(doc(db, d.col, d.id));
      if (snap.exists()) { skipped++; continue; }
    }
    todo.push(d);
  }

  if (!todo.length) {
    console.log("\n이미 모두 들어가 있습니다. (건너뜀 " + skipped + "건)");
    console.log("덮어쓰려면:  node seed.js --overwrite");
    process.exit(0);
  }

  /* Firestore 배치는 한 번에 500건까지 */
  for (let i = 0; i < todo.length; i += 400) {
    const chunk = todo.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const d of chunk) batch.set(doc(db, d.col, d.id), d.body);
    await batch.commit();
    console.log("  기록 " + (i + chunk.length) + "/" + todo.length);
  }

  console.log("\n완료 — 새로 " + todo.length + "건" + (skipped ? ", 건너뜀 " + skipped + "건" : "")
    + (OVERWRITE ? " (덮어쓰기 모드)" : ""));
  process.exit(0);
})().catch(e => {
  if (e && e.code === "permission-denied")
    die("보안 규칙이 쓰기를 막았습니다.\n   먼저 규칙을 올리세요:  npm run deploy:rules");
  die((e && (e.code || e.message)) || String(e));
});
