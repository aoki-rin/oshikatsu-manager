import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Run after npm ci and Gradle exportReleaseDependencies. No private paths appear in output.
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const sections = [readFileSync('LICENSE', 'utf8'), readFileSync('THIRD_PARTY_NOTICES.md', 'utf8')];
const licenseName = /^(?:licen[sc]e|copying|notice)(?:[.-]|$)/i;
const missing = [];
for (const [folder, metadata] of Object.entries(lock.packages).sort()) {
  if (!folder || metadata.dev || !existsSync(folder)) continue;
  const pkg = JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8'));
  const files = readdirSync(folder, { withFileTypes: true }).filter((f) => f.isFile() && licenseName.test(f.name));
  sections.push(`\n=== npm: ${pkg.name}@${pkg.version} (${pkg.license || metadata.license || 'see upstream'}) ===\n`);
  for (const file of files) sections.push(readFileSync(path.join(folder, file.name), 'utf8'));
  if (!files.length) {
    // Some packages carry their complete license in README or in the parent
    // package that distributes its platform-specific native binaries.
    const parent = pkg.name.startsWith('@esbuild/') ? 'esbuild' : pkg.name.startsWith('@rollup/rollup-') ? 'rollup' : null;
    const parentFolder = parent ? path.join(folder.slice(0, folder.lastIndexOf('node_modules/')), 'node_modules', parent) : null;
    const parentFiles = parentFolder && existsSync(parentFolder)
      ? readdirSync(parentFolder, { withFileTypes: true }).filter((f) => f.isFile() && licenseName.test(f.name)) : [];
    const readme = readdirSync(folder).find((f) => /^readme\.md$/i.test(f));
    const excerpt = readme ? readFileSync(path.join(folder, readme), 'utf8').match(/(?:^|\n)#+\s+License\b[\s\S]*/i)?.[0] : null;
    if (parentFiles.length) {
      for (const file of parentFiles) sections.push(readFileSync(path.join(parentFolder, file.name), 'utf8'));
    } else if (excerpt && /Permission is hereby granted/.test(excerpt)) {
      sections.push(excerpt);
    } else {
      missing.push(`${pkg.name}@${pkg.version}`);
    }
  }
}
if (missing.length) throw new Error(`Missing npm license texts: ${missing.join(', ')}`);

const artifacts = JSON.parse(readFileSync('android/app/build/release-dependencies.json', 'utf8'));
const temp = mkdtempSync(path.join(tmpdir(), 'oshikatsu-licenses-'));
const seen = new Set();
function archiveNotices(file) {
  const names = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).split('\n');
  for (const name of names.filter((n) => licenseName.test(path.posix.basename(n)))) {
    const value = execFileSync('unzip', ['-p', file, name], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    if (!seen.has(value)) { sections.push(value); seen.add(value); }
  }
  return names;
}
try {
  for (const artifact of artifacts) {
    sections.push(`\n=== Android: ${artifact.name} ===\n`);
    const names = archiveNotices(artifact.file);
    for (const name of names.filter((n) => n === 'classes.jar' || /^libs\/[^/]+\.jar$/.test(n))) {
      const nested = path.join(temp, 'nested.jar');
      writeFileSync(nested, execFileSync('unzip', ['-p', artifact.file, name], { maxBuffer: 64 * 1024 * 1024 }));
      archiveNotices(nested);
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
sections.push('\nAndroidX and the Android Capacitor runtime use Apache-2.0 and MIT respectively. Google Play Services is subject to https://developers.google.com/terms. The inventory above includes notices present in the distributed archives.\n');
sections.push(readFileSync('docs/licenses/Apache-2.0.txt', 'utf8'));
mkdirSync('release', { recursive: true });
writeFileSync('release/THIRD_PARTY_LICENSES.txt', sections.join('\n'));
console.log('Collected npm production dependency licenses and Android dependency inventory/notices.');
