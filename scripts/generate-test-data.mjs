// Generate a test backup zip with N text-only clipboard items.
// Usage: node scripts/generate-test-data.mjs [count] [output-path]
//   count defaults to 1000, output defaults to project root.
//
// Features:
//   - Time distributed across last 30 days (exponential decay: more items recently)
//   - Every item has unique content (no duplicates)
//   - Rich source app variety with weighted distribution
//   - Pinned items, favorites, notes for testing statistics panel

import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── CLI args ──────────────────────────────────────────────────────────
const count = parseInt(process.argv[2]) || 1000;
const outputPath = process.argv[3] || join(root, `test_backup_${count}_items.zip`);

// ── FNV-1a 64-bit hash (matches Rust clipboard.rs) ────────────────────
function fnv1a64(str) {
  let hash = 0xcbf29ce484222325n;
  const bytes = Buffer.from(str, 'utf-8');
  for (const b of bytes) {
    hash ^= BigInt(b);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  if (hash > 0x7fffffffffffffffn) {
    hash = hash - 0x10000000000000000n;
  }
  return Number(hash);
}

// ── Seeded random (deterministic across runs) ─────────────────────────
// Simple mulberry32 PRNG so content is reproducible but varied.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(42);

// ── Content generators ────────────────────────────────────────────────
const ZH_PREFIXES = [
  '通知：', '提醒：', '备忘：', '分享：', '转发：',
  '讨论：', '总结：', '问题：', '建议：', '更新：',
];

const ZH_TEMPLATES = [
  '{prefix}{sentence}',
  '{prefix}{sentence}\n{sentence2}',
  '{sentence}\n{url}',
  '{code}',
  '{sentence}\n{sentence2}\n{url}',
  '{prefix}{code}',
  '{code}\n// {sentence}',
  '{sentence}\n---\n{sentence2}',
];

const ZH_SENTENCES = [
  '今天天气真不错，适合出去走走。', '明天有个重要的会议要参加。',
  '这个方案看起来可行，我们再讨论一下细节。', '麻烦帮我打印一份文件，谢谢。',
  '周末一起去爬山怎么样？好久没运动了。', '新版本已经发布了，大家更新一下。',
  '这个功能需要优化一下，响应速度太慢了。', '下午三点在会议室碰个头，讨论一下项目进度。',
  '代码已经提交到主分支了，通过了所有测试。', '数据库备份已经完成，数据安全无忧。',
  '这个接口文档还需要补充一些示例。', '用户体验需要改进，界面不够直观。',
  '请查收附件中的报告，有问题请及时反馈。', '服务器负载有点高，需要扩容了。',
  '技术选型最终确定了使用 Rust 和 React。', '这个 bug 已经修复，等待测试验证。',
  '数据分析报告已经生成，发到你的邮箱了。', '下周要出差去上海，大概三天时间。',
  '这个项目的截止日期是下周五。', '会议室已经预定了，大家准时参加。',
  '请把最新的设计稿发给我看一下。', '系统升级维护时间定在周六凌晨。',
  '这个文案还需要再润色一下。', '客户端崩溃问题已经定位到了。',
  '性能测试结果出来了，比预期好很多。', '需求文档已经更新，新增了几个模块。',
  '请帮忙review一下这段代码。', '部署脚本需要更新一下环境变量。',
  '这个图片的尺寸太大了，压缩一下再用。', '配置文件需要改成yaml格式。',
  '接口返回的数据结构有变化，前端要做兼容。', '日志显示有异常请求，需要排查一下。',
  '这个第三方库的版本太旧了，需要升级。', '市场调研报告已经完成，明天做汇报。',
  'API 响应时间优化到了 50ms 以内。', 'Redis 缓存命中率提升到了 95%。',
  '前端打包体积减少了 30%，加载更快了。', 'CI/CD 流水线已经配置好了。',
  '这个 SQL 查询需要加个索引，否则全表扫描太慢。', '日志聚合系统已经上线，排查问题更方便了。',
  '测试覆盖率达到了 85%，还需要补一些边界用例。', '这个 PR 改动比较大，需要仔细 review。',
  '灰度发布已经完成，新版本覆盖了 20% 的用户。', '监控告警规则需要调整一下阈值。',
  '今天是周五，大家早点下班吧。', '下周一的晨会改到上午十点。',
];

const ZH_URLS = [
  'https://github.com/caojunshuai/SuperClipboard',
  'https://v2.tauri.app/zh-cn/guide/',
  'https://react.dev/reference/react',
  'https://tailwindcss.com/docs',
  'https://www.rust-lang.org/learn',
  'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript',
  'https://github.com/tauri-apps/tauri/discussions',
  'https://stackoverflow.com/questions/tagged/rust',
  'https://crates.io/crates/serde',
  'https://nodejs.org/api/fs.html',
];

const ZH_CODES = [
  'const result = await fetch("/api/users"); return result.json();',
  'fn main() { println!("Hello, world!"); }',
  'docker compose up -d --build',
  'SELECT * FROM users WHERE created_at > datetime("now", "-7 days")',
  'git rebase -i HEAD~5',
  'npm install && npm run dev',
  'cargo build --release --target x86_64-pc-windows-gnu',
  'kubectl get pods -n production',
  'useEffect(() => { fetchData(); }, [page]);',
  'impl From<ClipboardItem> for HistoryEntry { fn from(item: ClipboardItem) -> Self { ... } }',
  'tailwindcss -i ./src/input.css -o ./dist/output.css --watch',
  'python -m http.server 8080',
  'ssh -L 5432:localhost:5432 user@server',
  'curl -s https://api.github.com/repos/tauri-apps/tauri/releases/latest | jq .tag_name',
];

// ── Source apps with weighted distribution ────────────────────────────
// { name, weight } — higher weight = more likely to appear
const SOURCE_APPS = [
  { name: 'chrome.exe', weight: 35 },
  { name: 'vscode.exe', weight: 25 },
  { name: 'wechat.exe', weight: 15 },
  { name: 'terminal.exe', weight: 10 },
  { name: 'notepad.exe', weight: 5 },
  { name: 'obsidian.exe', weight: 5 },
  { name: 'figma.exe', weight: 3 },
  { name: 'slack.exe', weight: 2 },
];

const TOTAL_WEIGHT = SOURCE_APPS.reduce((s, a) => s + a.weight, 0);

function pickSourceApp() {
  let r = rng() * TOTAL_WEIGHT;
  for (const app of SOURCE_APPS) {
    r -= app.weight;
    if (r <= 0) return app.name;
  }
  return SOURCE_APPS[0].name;
}

// ── Content generation (guaranteed unique) ────────────────────────────
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }

function generateContent(i) {
  const prefix = pick(ZH_PREFIXES);
  const sentence = pick(ZH_SENTENCES);
  const sentence2 = pick(ZH_SENTENCES);
  const url = pick(ZH_URLS);
  const code = pick(ZH_CODES);
  const tpl = pick(ZH_TEMPLATES);

  let body = tpl
    .replace('{prefix}', prefix)
    .replace('{sentence}', sentence)
    .replace('{sentence2}', sentence2)
    .replace('{url}', url)
    .replace('{code}', code);

  // Append a unique index suffix to guarantee no duplicates.
  // Wrapped in a zero-width joiner block so it doesn't interfere with reading.
  body += '​#' + (i + 1);

  return body;
}

// ── Time helpers ──────────────────────────────────────────────────────
function fmtDate(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ── Generate items ────────────────────────────────────────────────────
const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;
const SPAN_DAYS = 30;

console.log(`Generating ${count} test items...`);

// Pre-compute daily counts: more items in recent days (exponential decay
// from today back to 30 days ago).
// day index: 0 = 30 days ago, SPAN_DAYS-1 = today
const rawWeights = Array.from({ length: SPAN_DAYS }, (_, day) => {
  const daysAgo = SPAN_DAYS - 1 - day;
  return Math.exp(-daysAgo / 7);  // half-life ≈ 5 days
});
const totalWeight = rawWeights.reduce((a, w) => a + w, 0);

// Distribute items across days (fractional → integer with remainder correction)
const itemsPerDay = new Array(SPAN_DAYS).fill(0);
let assigned = 0;
for (let day = 0; day < SPAN_DAYS; day++) {
  if (day === SPAN_DAYS - 1) {
    itemsPerDay[day] = count - assigned;
  } else {
    itemsPerDay[day] = Math.round(count * rawWeights[day] / totalWeight);
    assigned += itemsPerDay[day];
  }
}

const allItems = [];
let globalIdx = 0;
for (let day = 0; day < SPAN_DAYS; day++) {
  const dayStart = new Date(NOW - (SPAN_DAYS - 1 - day) * DAY_MS);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  for (let j = 0; j < itemsPerDay[day]; j++) {
    // Random time within the day, weighted toward business hours (9-18)
    const hour = Math.random() < 0.7
      ? 9 + Math.floor(rng() * 10)   // 9:00-18:00 (70% of items)
      : Math.floor(rng() * 24);      // any hour (30%)
    const minute = Math.floor(rng() * 60);
    const second = Math.floor(rng() * 60);
    const ts = new Date(dayStart);
    ts.setHours(hour, minute, second);
    // Clamp to valid range
    if (ts < dayStart) ts.setHours(0, 0, 0, 0);
    if (ts >= dayEnd) ts.setHours(23, 59, 59);

    const content = generateContent(globalIdx);
    const tsStr = fmtDate(ts);

    allItems.push({
      id: globalIdx + 1,
      item_type: 'text',
      content,
      image_path: null,
      thumbnail_path: null,
      file_paths: null,
      source_app: pickSourceApp(),
      char_count: content.length,
      image_size: null,
      is_pinned: globalIdx < 3,
      is_favorite: globalIdx < 15 && rng() > 0.4,
      metadata: null,
      content_hash: fnv1a64(content),
      note: globalIdx % 40 === 0 ? `这是第 ${globalIdx + 1} 条记录的备注` : null,
      created_at: tsStr,
      updated_at: tsStr,
    });
    globalIdx++;
  }
}

// Sort by created_at descending (newest first, matching real DB order)
allItems.sort((a, b) => b.created_at.localeCompare(a.created_at));

// Re-assign sequential IDs after sort
allItems.forEach((item, i) => { item.id = i + 1; });

// ── Build zip ─────────────────────────────────────────────────────────
const tmpDir = join(tmpdir(), `sc_test_data_${Date.now()}`);
mkdirSync(tmpDir, { recursive: true });

const jsonStr = JSON.stringify(allItems, null, 2);
const jsonPath = join(tmpDir, 'clipboard_data.json');
writeFileSync(jsonPath, jsonStr, 'utf-8');
console.log(`  Wrote ${count} items (${(Buffer.byteLength(jsonStr) / 1024 / 1024).toFixed(1)} MB JSON)`);

execSync(
  `powershell -Command "Compress-Archive -Path '${jsonPath}' -DestinationPath '${outputPath}' -Force"`,
  { stdio: 'inherit' }
);

rmSync(tmpDir, { recursive: true, force: true });

console.log(`Done: ${outputPath}`);
const pinned = allItems.filter(i => i.is_pinned).length;
const favs = allItems.filter(i => i.is_favorite).length;
const notes = allItems.filter(i => i.note).length;
const sources = [...new Set(allItems.map(i => i.source_app))];
const dateMin = fmtDate(new Date(NOW - (SPAN_DAYS - 1) * DAY_MS));
const dateMax = fmtDate(new Date(NOW));
console.log(`  ${count} items | ${pinned} pinned | ${favs} favorites | ${notes} notes`);
console.log(`  ${sources.length} source apps: ${sources.join(', ')}`);
console.log(`  date range: ${dateMin} ~ ${dateMax}`);
console.log(`  daily breakdown: ${itemsPerDay.map((n, d) => `D-${SPAN_DAYS - 1 - d}:${n}`).join(' ')}`);
