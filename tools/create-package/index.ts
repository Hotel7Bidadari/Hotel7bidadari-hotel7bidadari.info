/* eslint-disable no-console */
import path from 'node:path';
import fs from 'fs-extra';

const args = process.argv.slice(2);

function validateArgs (_args: string[]): _args is [string, 'true' | 'false'] {
  if (_args.length !== 2) {
    console.error(`Invalid arguments. Expected 2 arguments, received ${_args.length}`);
    return false;
  }

  const arg1 = _args[1]?.trim().toLowerCase();
  if (arg1 !== 'y' && arg1 !== 'n') {
    console.error(`Invalid arguments. Second argument must be \`y\` or \`n\``);
    return false;
  }

  return true;
}

if (validateArgs(args)) {
  const name = args[0].trim();
  const isInternal = args[1].trim() === 'y';
  console.log('🛠️ generating your package...');

  const srcPath = path.join(__dirname, 'template');
  const dstPath = path.join(__dirname, '..', '..', isInternal ? 'internals' : 'packages', name);

  try {
    fs.copySync(srcPath, dstPath);
    const pkgJSONPath = path.join(dstPath, 'package.json');
    const pkgJSON = JSON.parse(fs.readFileSync(pkgJSONPath, 'utf-8')) as { name: string, private: boolean };
    pkgJSON.name = `@${isInternal ? 'vercel-internals' : 'vercel' }/${name}`;
    pkgJSON.private = isInternal;
    fs.writeFileSync(pkgJSONPath, JSON.stringify(pkgJSON, null, 2));
    console.log(`Created new package in ${dstPath}`)
  } catch (err) {
    console.error(`Failed to create new package`);
    console.error(err);
  }
} else {
  console.log('Usage: create-package [name] [internal (y/n)]');
  process.exit(1);
}
