import { join, dirname, basename, sep } from 'path';
import execa from 'execa';
import fs from 'fs';
import { mkdirp } from 'fs-extra';
import { promisify } from 'util';
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
import buildUtils from './build-utils';
import { BuildOptions } from '@vercel/build-utils';
const {
  getWriteableDirectory,
  download,
  glob,
  createLambda,
  shouldServe,
  debug,
} = buildUtils;
import { installRequirement, installRequirementsFile } from './install';

async function pipenvConvert(cmd: string, srcDir: string) {
  debug('Running pipfile2req...');
  try {
    const out = await execa.stdout(cmd, [], {
      cwd: srcDir,
    });
    fs.writeFileSync(join(srcDir, 'requirements.txt'), out);
  } catch (err) {
    console.log('Failed to run "pipfile2req"');
    throw err;
  }
}

async function matchPaths(
  configPatterns: string | string[] | undefined,
  workPath: string
) {
  if (!configPatterns) {
    return [];
  }

  const patterns =
    typeof configPatterns === 'string' ? [configPatterns] : configPatterns;

  const patternPaths = await Promise.all(
    patterns.map(async pattern => {
      const files = await glob(pattern, workPath);
      return Object.keys(files);
    })
  );

  return ([] as string[]).concat(...patternPaths);
}

export const version = 3;

export async function downloadFilesInWorkPath({
  entrypoint,
  workPath,
  files,
  meta = {},
}: BuildOptions) {
  debug('Downloading user files...');
  let downloadedFiles = await download(files, workPath, meta);
  if (meta.isDev) {
    // Old versions of the CLI don't assign this property
    const { devCacheDir = join(workPath, '.now', 'cache') } = meta;
    const entrypointCacheDir = join(
      dirname(entrypoint),
      basename(entrypoint, '.py')
    ).replace(new RegExp(sep, 'g'), '__');
    const destCache = join(devCacheDir, entrypointCacheDir);
    await download(downloadedFiles, destCache);
    downloadedFiles = await glob('**', destCache);
    workPath = destCache;
  }
  return workPath;
}

export const build = async ({
  workPath,
  files: originalFiles,
  entrypoint,
  meta = {},
  config,
}: BuildOptions) => {
  workPath = await downloadFilesInWorkPath({
    workPath,
    files: originalFiles,
    entrypoint,
    meta,
    config,
  });

  try {
    // See: https://stackoverflow.com/a/44728772/376773
    //
    // The `setup.cfg` is required for `vercel dev` on MacOS, where without
    // this file being present in the src dir then this error happens:
    //
    // distutils.errors.DistutilsOptionError: must supply either home
    // or prefix/exec-prefix -- not both
    if (meta.isDev) {
      const setupCfg = join(workPath, 'setup.cfg');
      await writeFile(setupCfg, '[install]\nprefix=\n');
    }
  } catch (err) {
    console.log('Failed to create "setup.cfg" file');
    throw err;
  }

  console.log('Installing required dependencies...');

  const packagesDir = 'now__pypackages';

  await mkdirp(join(workPath, packagesDir));

  await installRequirement({
    dependency: 'werkzeug',
    workPath: join(workPath, packagesDir),
    meta,
  });

  let fsFiles = await glob('**', workPath);
  const entryDirectory = dirname(entrypoint);

  const pipfileLockDir = fsFiles[join(entryDirectory, 'Pipfile.lock')]
    ? join(workPath, entryDirectory)
    : fsFiles['Pipfile.lock']
    ? workPath
    : null;

  if (pipfileLockDir) {
    debug('Found "Pipfile.lock"');

    // Convert Pipenv.Lock to requirements.txt.
    // We use a different`workPath` here because we want `pipfile-requirements` and it's dependencies
    // to not be part of the lambda environment. By using pip's `--target` directive we can isolate
    // it into a separate folder.
    const tempDir = await getWriteableDirectory();
    await installRequirement({
      dependency: 'pipfile-requirements',
      workPath: tempDir,
      meta,
      args: ['--no-warn-script-location'],
    });

    // Python needs to know where to look up all the packages we just installed.
    // We tell it to use the same location as used with `--target`
    const pythonPath = process.env.PYTHONPATH;
    process.env.PYTHONPATH = tempDir;
    const convertCmd = join(tempDir, 'bin', 'pipfile2req');
    await pipenvConvert(convertCmd, pipfileLockDir);
    if (pythonPath === undefined) {
      delete process.env.PYTHONPATH;
    } else {
      process.env.PYTHONPATH = pythonPath;
    }
  }

  fsFiles = await glob('**', workPath);
  const requirementsTxt = join(entryDirectory, 'requirements.txt');

  if (fsFiles[requirementsTxt]) {
    debug('Found local "requirements.txt"');
    const requirementsTxtPath = fsFiles[requirementsTxt].fsPath;
    await installRequirementsFile({
      filePath: requirementsTxtPath,
      workPath: join(workPath, packagesDir),
      meta,
    });
  } else if (fsFiles['requirements.txt']) {
    debug('Found global "requirements.txt"');
    const requirementsTxtPath = fsFiles['requirements.txt'].fsPath;
    await installRequirementsFile({
      filePath: requirementsTxtPath,
      workPath: join(workPath, packagesDir),
      meta,
    });
  }

  const originalPyPath = join(__dirname, '..', 'now_init.py');
  const originalNowHandlerPyContents = await readFile(originalPyPath, 'utf8');
  debug('Entrypoint is', entrypoint);
  const moduleName = entrypoint.replace(/\//g, '.').replace(/\.py$/, '');
  // Since `vercel dev` renames source files, we must reference the original
  const suffix = meta.isDev && !entrypoint.endsWith('.py') ? '.py' : '';
  const entrypointWithSuffix = `${entrypoint}${suffix}`;
  debug('Entrypoint with suffix is', entrypointWithSuffix);
  const nowHandlerPyContents = originalNowHandlerPyContents
    .replace(/__NOW_HANDLER_MODULE_NAME/g, moduleName)
    .replace(/__NOW_HANDLER_ENTRYPOINT/g, entrypointWithSuffix)
    .replace(/__NOW_PACKAGES_DIR/g, packagesDir);

  // in order to allow the user to have `server.py`, we need our `server.py` to be called
  // somethig else
  const nowHandlerPyFilename = 'now__handler__python';

  await writeFile(
    join(workPath, `${nowHandlerPyFilename}.py`),
    nowHandlerPyContents
  );

  // Use the system-installed version of `python3` when running via `vercel dev`
  const runtime = meta.isDev ? 'python3' : 'python3.6';

  const outputFiles = await glob('**', workPath);

  // Static analysis is impossible with Python. Instead, provide `includeFiles`
  // and `excludeFiles` config options to reduce bundle size.
  if (config && (config.includeFiles || config.excludeFiles)) {
    const includedPaths = await matchPaths(config.includeFiles, workPath);
    const excludedPaths = await matchPaths(
      config.excludeFiles || 'node_modules/**',
      workPath
    );

    for (let i = 0; i < excludedPaths.length; i++) {
      // whitelist includeFiles
      if (includedPaths.includes(excludedPaths[i])) {
        continue;
      }

      // whitelist handler
      if (excludedPaths[i] === `${nowHandlerPyFilename}.py`) {
        continue;
      }

      // whitelist Python packages directory
      if (excludedPaths[i].startsWith(packagesDir)) {
        continue;
      }

      delete outputFiles[excludedPaths[i]];
    }
  }

  const lambda = await createLambda({
    files: outputFiles,
    handler: `${nowHandlerPyFilename}.now_handler`,
    runtime,
    environment: {},
  });

  return { output: lambda };
};

export { shouldServe };

// internal only - expect breaking changes if other packages depend on these exports
export { installRequirement, installRequirementsFile };
