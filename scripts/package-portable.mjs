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

if (!existsSync(lzmaPath)) {
  console.error(`Error: liblzma-5.dll not found at ${lzmaPath}`);
  process.exit(1);
}

console.log(`Packaging SuperClipboard v${version} portable...`);

execSync(
  `powershell -Command "Compress-Archive -Path '${join(releaseDir, exeName)}','${join(releaseDir, dllName)}','${lzmaPath}' -DestinationPath '${zipPath}' -Force"`,
  { stdio: 'inherit' }
);

console.log(`Done: ${zipName}`);
