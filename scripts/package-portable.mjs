// Package portable release zip from Tauri build output
import { execSync } from 'child_process';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Read version from Cargo.toml
const cargoToml = readFileSync(join(root, 'src-tauri', 'Cargo.toml'), 'utf-8');
const versionMatch = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
const version = versionMatch ? versionMatch[1] : '0.0.0';

const releaseDir = join(root, 'src-tauri', 'target', 'release');
const exeName = 'SuperClipboard.exe';
const dllName = 'WebView2Loader.dll';
const lzmaPath = join(root, 'src-tauri', 'liblzma-5.dll');
const zipName = `SuperClipboard-v${version}-portable.zip`;
const zipPath = join(root, zipName);

if (!existsSync(join(releaseDir, exeName))) {
  console.error(`Error: ${exeName} not found in ${releaseDir}`);
  console.error('Run "npm run tauri build" first.');
  process.exit(1);
}

// DLLs are toolchain-dependent and must be optional, not required:
// - WebView2Loader.dll: statically linked since Tauri 2.11 (webview2-com static
//   feature) — no DLL is produced for either toolchain
// - liblzma-5.dll: only GNU (MinGW) builds link lzma dynamically; MSVC links it
//   statically
const files = [join(releaseDir, exeName)];
for (const dll of [
  { path: join(releaseDir, dllName), label: dllName },
  { path: lzmaPath, label: 'liblzma-5.dll' },
]) {
  if (existsSync(dll.path)) files.push(dll.path);
  else console.log(`Note: ${dll.label} not found — skipping (static-linked, not needed)`);
}

console.log(`Packaging SuperClipboard v${version} portable...`);

execSync(
  `powershell -Command "Compress-Archive -Path '${files.join("','")}' -DestinationPath '${zipPath}' -Force"`,
  { stdio: 'inherit' }
);

console.log(`Done: ${zipName}`);
