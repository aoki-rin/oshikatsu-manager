import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => readFileSync(path.join(root, name), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const android = read('android/app/build.gradle');
const ios = read('ios/App/App.xcodeproj/project.pbxproj');
const fail = (message) => { throw new Error(message); };

if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) fail('Use a stable x.y.z release version.');
const versions = [
  lock.version,
  lock.packages[''].version,
  android.match(/versionName\s+"([^"]+)"/)?.[1],
  ...Array.from(ios.matchAll(/MARKETING_VERSION = ([^;]+);/g), (m) => m[1]),
];
if (versions.length !== 5 || versions.some((v) => v !== pkg.version)) {
  fail('package.json, package-lock.json, Android and both iOS configurations must use the same version.');
}
const build = Number(android.match(/versionCode\s+(\d+)/)?.[1]);
const iosBuilds = Array.from(ios.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g), (m) => Number(m[1]));
if (!Number.isSafeInteger(build) || build < 1 || iosBuilds.length !== 2 || iosBuilds.some((v) => v !== build)) {
  fail('Android versionCode and both iOS build numbers must match and be positive integers.');
}
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${pkg.version}`) {
  fail(`Release tag must be v${pkg.version}.`);
}
console.log(`Version ${pkg.version}, native build ${build}`);
