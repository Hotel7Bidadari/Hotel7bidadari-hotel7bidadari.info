import { join } from 'path';
import { writeFile } from 'fs/promises';

const dirRoot = join(__dirname, '..');

async function createConstants() {
  console.log('Creating constants.ts');
  const filename = join(dirRoot, 'src/constants.ts');
  const contents = `// This file is auto-generated
export const GA_TRACKING_ID: string | undefined = ${envToString(
    'GA_TRACKING_ID'
  )};
export const SENTRY_DSN: string | undefined = ${envToString('SENTRY_DSN')};
`;
  await writeFile(filename, contents, 'utf8');
}

function envToString(key: string) {
  const value = process.env[key];
  if (!value) {
    console.log(`- Constant ${key} is not assigned`);
  }
  return JSON.stringify(value);
}

async function main() {
  // Read the secrets from GitHub Actions and generate a file.
  // During local development, these secrets will be empty.
  await createConstants();
}


process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', err => {
  console.error('Uncaught Exception:');
  console.error(err);
  process.exit(1);
});

main().catch(err => {
  console.error(err);
  process.exit(1);
});
