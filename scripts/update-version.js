import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const version = process.argv[2];

if (!version) {
  console.error('Version argument missing');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');

// Update package.json + package-lock.json safely
execSync(`npm version ${version} --no-git-tag-version`, {
  cwd: root,
  stdio: 'inherit',
});

console.log(`Updated package.json and package-lock.json → ${version}`);
