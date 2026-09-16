/* ============================================================
   로컬 확인용 — Firestore 없이 화면만 열어 본다
   ------------------------------------------------------------
   public/ 을 그대로 서빙하되, Firestore 자리에 data/ 를 읽어들인
   가짜 저장소를 끼운다. 실제 Firestore에 붙지 않으므로 아무것도
   저장되지 않고, 배포물에는 포함되지 않는다.

   배포 전에 "화면이 제대로 뜨는지"만 눈으로 보려는 용도다.
   저장·권한처럼 Firestore가 실제로 관여하는 동작은
   배포한 주소에서 확인해야 한다.

   실행:  node localtest.js      →  http://localhost:5055
   ============================================================ */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PUB = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
const PORT = Number(process.env.PORT || 5055);

/* ── data/ 를 통째로 읽어 가짜 저장소의 초기값으로 쓴다 ─────── */
function snapshot() {
  const out = {};
  if (!fs.existsSync(DATA)) return out;
  for (const col of fs.readdirSync(DATA)) {
    const dir = path.join(DATA, col);
    if (!fs.statSync(dir).isDirectory()) continue;
    out[col] = {};
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".json")) out[col][path.basename(f, ".json")] = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    }
  }
  return out;
}

/* ── 가짜 firebase — 앱이 쓰는 메서드만 흉내 낸다 ───────────── */
const SHIM = seed => `
/* 로컬 확인용 가짜 Firestore. 배포본에는 들어가지 않는다. */
(function () {
  var DB = ${JSON.stringify(seed)};
  var subs = [];
  function fire(col) { subs.filter(s => s.col === col).forEach(s => s.cb(snap(col))); }
  function snap(col) {
    var m = DB[col] || {};
    return { docs: Object.keys(m).sort().map(id => ({ id: id, data: () => JSON.parse(JSON.stringify(m[id])) })) };
  }
  function ensure(col) { return (DB[col] = DB[col] || {}); }
  function rid() { return "x" + Math.random().toString(36).slice(2, 12); }
  function split(p) { var i = p.indexOf("/"); return [p.slice(0, i), p.slice(i + 1)]; }

  function docRef(col, id) {
    return {
      set: async function (b) { ensure(col)[id] = JSON.parse(JSON.stringify(b)); fire(col); },
      update: async function (b) { var m = ensure(col); m[id] = Object.assign({}, m[id], JSON.parse(JSON.stringify(b))); fire(col); },
      delete: async function () { delete ensure(col)[id]; fire(col); },
      get: async function () { var m = ensure(col); return { exists: id in m, data: () => m[id] }; }
    };
  }

  var store = {
    settings: function () {},
    doc: function (p) { var a = split(p); return docRef(a[0], a[1]); },
    collection: function (col) {
      return {
        doc: function (id) { return docRef(col, id); },
        add: async function (b) { var id = rid(); ensure(col)[id] = JSON.parse(JSON.stringify(b)); fire(col); return { id: id }; },
        onSnapshot: function (cb) { subs.push({ col: col, cb: cb }); setTimeout(() => cb(snap(col)), 0); return function () {}; }
      };
    }
  };

  window.firebase = {
    apps: [],
    initializeApp: function (c) { this.apps.push(c); return c; },
    auth: function () { return { signInAnonymously: async function () { return { user: { uid: "local-test" } }; } }; },
    firestore: function () { return store; }
  };
  window.__ESG_FIREBASE_CONFIG = { projectId: "local-test" };
  console.log("[로컬 확인] 가짜 Firestore 사용 중 — 저장되지 않습니다.");
})();
`;

/* ── 정적 서버 ──────────────────────────────────────────────── */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);

  if (url === "/firebase-config.js") {
    res.writeHead(200, { "Content-Type": TYPES[".js"] });
    return res.end(SHIM(snapshot()));
  }
  if (url === "/__/firebase/init.js") { // Hosting에만 있는 것. 로컬에서는 빈 응답.
    res.writeHead(200, { "Content-Type": TYPES[".js"] });
    return res.end("/* 로컬에는 없음 */");
  }

  const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
  const file = path.join(PUB, rel);
  if (!file.startsWith(PUB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "Content-Type": TYPES[".html"] });
    return res.end("not found");
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log("로컬 확인용 서버 — http://localhost:" + PORT);
  console.log("가짜 저장소라 저장은 되지 않습니다. 화면 확인 전용입니다.");
});
