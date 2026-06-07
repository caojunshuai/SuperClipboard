// Generate a test backup zip with N text-only clipboard items.
// Usage: node scripts/generate-test-data.mjs [count] [output-path]
//   count defaults to 1000, output defaults to project root.

import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
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

// ── Content generators ────────────────────────────────────────────────
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
];

const ZH_URLS = [
  'https://github.com/caojunshuai/SuperClipboard',
  'https://v2.tauri.app/zh-cn/guide/',
  'https://react.dev/reference/react',
  'https://tailwindcss.com/docs',
  'https://www.rust-lang.org/learn',
  'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript',
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
];

const SOURCE_APPS = ['vscode.exe', 'chrome.exe', 'wechat.exe', 'notepad.exe', 'terminal.exe'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateContent(i) {
  const r = Math.random();
  if (r < 0.6) {
    const n = 1 + Math.floor(Math.random() * 3);
    return Array.from({ length: n }, () => pick(ZH_SENTENCES)).join('');
  } else if (r < 0.75) {
    return `${pick(ZH_SENTENCES)}\n${pick(ZH_URLS)}`;
  } else if (r < 0.85) {
    return pick(ZH_CODES);
  } else {
    return `这是第${i + 1}条测试数据。用于测试 SuperClipboard 的导入恢复功能。\n` +
      `包含多行文本内容，模拟用户日常复制粘贴的场景。\n` +
      `${pick(ZH_SENTENCES)}\n相关链接：${pick(ZH_URLS)}`;
  }
}

function fmtDate(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ── Generate items ────────────────────────────────────────────────────
const BASE_TIME = Date.now();
const SPAN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

console.log(`Generating ${count} test items...`);

const items = [];
for (let i = 0; i < count; i++) {
  const content = generateContent(i);
  const ts = new Date(BASE_TIME - Math.random() * SPAN_MS);
  const tsStr = fmtDate(ts);

  items.push({
    id: i + 1,
    item_type: 'text',
    content,
    image_path: null,
    thumbnail_path: null,
    file_paths: null,
    source_app: pick(SOURCE_APPS),
    char_count: content.length,
    image_size: null,
    is_pinned: i < 3,
    is_favorite: i < 10 && Math.random() > 0.5,
    metadata: null,
    content_hash: fnv1a64(content),
    note: i % 50 === 0 ? `这是第 ${i + 1} 条记录的备注` : null,
    created_at: tsStr,
    updated_at: tsStr,
  });
}

// ── Build zip ─────────────────────────────────────────────────────────
// Write JSON to a temp dir, zip it, then clean up
const tmpDir = join(tmpdir(), `sc_test_data_${Date.now()}`);
mkdirSync(tmpDir, { recursive: true });

const jsonStr = JSON.stringify(items, null, 2);
const jsonPath = join(tmpDir, 'clipboard_data.json');
writeFileSync(jsonPath, jsonStr, 'utf-8');
console.log(`  Wrote ${count} items (${(Buffer.byteLength(jsonStr) / 1024 / 1024).toFixed(1)} MB JSON)`);

execSync(
  `powershell -Command "Compress-Archive -Path '${jsonPath}' -DestinationPath '${outputPath}' -Force"`,
  { stdio: 'inherit' }
);

rmSync(tmpDir, { recursive: true, force: true });

console.log(`Done: ${outputPath}`);
const pinned = items.filter(i => i.is_pinned).length;
const notes = items.filter(i => i.note).length;
console.log(`  ${count} text items, ${pinned} pinned, ${notes} with notes, ` +
  `date range: ${fmtDate(new Date(BASE_TIME - SPAN_MS))} ~ ${fmtDate(new Date(BASE_TIME))}`);
