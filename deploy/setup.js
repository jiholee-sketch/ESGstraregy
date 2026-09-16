/* ============================================================
   ESG 중장기전략 진척관리 — 프로젝트 준비 (최초 1회)
   ------------------------------------------------------------
   배포 전에 Google Cloud 쪽에 있어야 하는 것들을 확인하고,
   없으면 만든다. 이미 있으면 그대로 둔다. 몇 번 돌려도 안전하다.

     1. firebase 로그인 여부
     2. ai-crew-9-common 프로젝트 접근 권한
     3. Firestore 데이터베이스  (없으면 서울 리전에 생성)
     4. 웹 앱 등록             (없으면 생성)

   실행:  npm run setup
   ============================================================ */
const path = require("path");
const { execFileSync } = require("child_process");
const fs = require("fs");

const ROOT = __dirname;
const PROJECT = JSON.parse(fs.readFileSync(path.join(ROOT, ".firebaserc"), "utf8")).projects.default;
const LOCATION = process.env.ESG_FIRESTORE_LOCATION || "asia-northeast3"; // 서울
/* .cmd 래퍼가 아니라 CLI의 자바스크립트 본체를 node로 직접 돌린다.
   Node 18 이후 윈도우에서 .cmd 실행이 막혀 있어서다. */
const CLI = path.join(ROOT, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");

let step = 0;
const say = m => console.log(m);
const head = m => console.log("\n[" + (++step) + "] " + m);
const ok = m => console.log("    v " + m);
const add = m => console.log("    + " + m);

function run(args, opts) {
  opts = opts || {};
  try {
    return {
      ok: true,
      out: execFileSync(process.execPath, [CLI].concat(args), {
        cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (e) {
    return { ok: false, out: String((e.stdout || "") + (e.stderr || "")) };
  }
}

function json(args) {
  const r = run(args.concat(["--json"]));
  if (!r.ok) return { ok: false, out: r.out };
  try { return { ok: true, data: JSON.parse(r.out) }; }
  catch (e) { return { ok: false, out: r.out }; }
}

function stop(title, lines) {
  console.error("\n────────────────────────────────────────");
  console.error("멈춤 — " + title);
  console.error("────────────────────────────────────────");
  for (const l of lines) console.error(l);
  console.error("");
  process.exit(1);
}

say("프로젝트 " + PROJECT + " 준비 상태를 확인합니다.");

/* ── 1. 로그인 + 프로젝트 접근 ──────────────────────────────── */
head("firebase 로그인 확인");
const projects = json(["projects:list"]);
if (!projects.ok) {
  if (/login|credential|authenticate/i.test(projects.out || "")) {
    stop("로그인이 되어 있지 않습니다.", [
      "브라우저가 열리는 로그인이라 이 스크립트가 대신 할 수 없습니다.",
      "아래를 직접 실행한 뒤 다시 npm run setup 하세요.",
      "",
      "    npm run login",
    ]);
  }
  stop("프로젝트 목록을 읽지 못했습니다.", [(projects.out || "").trim().slice(0, 800)]);
}
const list = (projects.data && (projects.data.result || projects.data)) || [];
const found = Array.isArray(list) && list.some(p => (p.projectId || p.project_id) === PROJECT);
if (!found) {
  stop("이 계정으로 " + PROJECT + " 에 접근할 수 없습니다.", [
    "확인할 것 — 로그인한 구글 계정이 이 프로젝트의 구성원인지,",
    "그리고 프로젝트 ID 철자가 맞는지 (.firebaserc 에 적혀 있습니다).",
    "",
    "지금 계정으로 보이는 프로젝트:",
    ...(Array.isArray(list) ? list.slice(0, 15).map(p => "    " + (p.projectId || p.project_id)) : []),
  ]);
}
ok("접근 가능: " + PROJECT);

/* ── 2. Firestore 데이터베이스 ──────────────────────────────── */
head("Firestore 데이터베이스 확인");
const dbs = json(["firestore:databases:list", "--project", PROJECT]);
const dbList = (dbs.ok && (dbs.data.result || dbs.data)) || [];
const hasDefault = Array.isArray(dbList)
  && dbList.some(d => String(d.name || "").endsWith("/(default)"));

if (hasDefault) {
  const d = dbList.find(x => String(x.name || "").endsWith("/(default)"));
  ok("이미 있습니다 (리전 " + (d.locationId || "?") + ")");
  /* Datastore 모드면 이 앱이 쓰는 Firestore API가 통하지 않는다. */
  const mode = String(d.type || d.databaseType || "");
  if (mode && !/FIRESTORE_NATIVE/i.test(mode)) {
    stop("데이터베이스가 Firestore 네이티브 모드가 아닙니다. (" + mode + ")", [
      "이 앱은 네이티브 모드에서만 동작합니다. 모드는 나중에 바꿀 수 없어서,",
      "이름이 다른 데이터베이스를 새로 만들어 쓰거나 별도 프로젝트가 필요합니다.",
      "",
      "먼저 ESG 사무국·IT와 상의하시길 권합니다.",
      "    https://console.cloud.google.com/datastore/welcome?project=" + PROJECT,
    ]);
  }
} else {
  add("없어서 만듭니다 — 리전 " + LOCATION);
  const c = run(["firestore:databases:create", "(default)",
    "--location", LOCATION, "--project", PROJECT]);
  if (!c.ok) {
    if (/already exists/i.test(c.out)) ok("이미 있습니다");
    else if (/API .*not.*enabled|SERVICE_DISABLED|has not been used/i.test(c.out)) {
      stop("Firestore API가 아직 켜져 있지 않습니다.", [
        "아래 주소에서 '사용 설정'을 누른 뒤 1~2분 기다렸다가 다시 실행하세요.",
        "",
        "    https://console.cloud.google.com/apis/library/firestore.googleapis.com?project=" + PROJECT,
      ]);
    } else {
      stop("데이터베이스를 만들지 못했습니다.", [
        c.out.trim().slice(0, 800),
        "",
        "콘솔에서 직접 만들어도 됩니다:",
        "    https://console.firebase.google.com/project/" + PROJECT + "/firestore",
      ]);
    }
  } else ok("만들었습니다");
}

/* ── 3. 웹 앱 등록 ──────────────────────────────────────────── */
head("웹 앱 등록 확인");
const apps = json(["apps:list", "WEB", "--project", PROJECT]);
const appList = (apps.ok && (apps.data.result || apps.data)) || [];
if (Array.isArray(appList) && appList.length) {
  ok("이미 있습니다 — " + (appList[0].displayName || appList[0].appId));
} else {
  add("없어서 만듭니다");
  const c = run(["apps:create", "WEB", "ESG 중장기전략 진척관리", "--project", PROJECT]);
  if (!c.ok) stop("웹 앱을 만들지 못했습니다.", [c.out.trim().slice(0, 800)]);
  ok("만들었습니다");
}

/* ── 4. 이미 쓰고 있는 호스팅이 있는지 ──────────────────────── */
head("호스팅 사이트 확인");
const sites = json(["hosting:sites:list", "--project", PROJECT]);
const siteList = (sites.ok && (sites.data.result && sites.data.result.sites || sites.data.sites || sites.data)) || [];
if (Array.isArray(siteList) && siteList.length) {
  for (const s of siteList) ok((s.name || "").split("/").pop() + "  " + (s.defaultUrl || ""));
  if (siteList.length > 0) {
    console.log("");
    console.log("    ! 공용 프로젝트라면 이 사이트를 다른 팀이 쓰고 있을 수 있습니다.");
    console.log("      바로 덮어쓰지 말고 먼저 임시 주소로 올려 확인하세요:");
    console.log("          npm run preview");
  }
} else {
  ok("아직 없습니다 (첫 배포 때 자동 생성)");
}

/* ── 마무리 ─────────────────────────────────────────────────── */
console.log("\n────────────────────────────────────────");
console.log("준비 끝. 남은 순서");
console.log("────────────────────────────────────────");
console.log("  1) 익명 로그인 켜기 — 콘솔에서 한 번만 (이걸 안 하면 저장이 안 됩니다)");
console.log("     https://console.firebase.google.com/project/" + PROJECT + "/authentication/providers");
console.log("");
console.log("  2) npm run preview    임시 주소로 먼저 확인 (7일 뒤 자동 삭제)");
console.log("  3) npm run deploy     실제 주소로 올리기");
console.log("  4) npm run seed       예시 데이터 넣기 (선택)");
console.log("");
