// Bump the app version across Cargo.toml, package.json, and package-lock.json
// Cargo.toml is the single source of truth — tauri.conf.json inherits it.
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const next = process.argv[2];
if (!next) {
    console.error('Usage: npm run version:bump <x.y.z>');
    process.exit(1);
}
if (!/^\d+\.\d+\.\d+$/.test(next)) {
    console.error(`Error: invalid version "${next}" — expected x.y.z`);
    process.exit(1);
}

// src-tauri/Cargo.toml — package version (first match only)
const cargoPath = join(root, 'src-tauri', 'Cargo.toml');
const cargoToml = readFileSync(cargoPath, 'utf-8');
if (!/^version\s*=\s*"[^"]+"/m.test(cargoToml)) {
    console.error('Error: version not found in src-tauri/Cargo.toml');
    process.exit(1);
}
const cargoNext = cargoToml.replace(/^version\s*=\s*"[^"]+"/m, `version = "${next}"`);
writeFileSync(cargoPath, cargoNext);

// package.json
const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const previous = pkg.version;
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// package-lock.json — root version plus the root package entry
const lockPath = join(root, 'package-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));
lock.version = next;
if (lock.packages && lock.packages['']) {
    lock.packages[''].version = next;
}
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');

console.log(`Version bumped: ${previous} -> ${next}`);
console.log('Next: update the CHANGELOG.md heading, then commit.');
