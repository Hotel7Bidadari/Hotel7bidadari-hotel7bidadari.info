import { basename, extname, join } from 'path';
import { BuilderParams, BuildResult, RouteConfig, ShouldServeParams } from './types';

export function build({ files, entrypoint }: BuilderParams): BuildResult {
  const outputs = {
    [entrypoint]: files[entrypoint]
  };
  const routes: RouteConfig[] = [
    { src: entrypoint, dest: entrypoint }
  ];
  const watch = [entrypoint];

  return { outputs, routes, watch };
}

export function shouldServe({
  entrypoint,
  files,
  requestPath
}: ShouldServeParams) {
  if (isIndex(entrypoint)) {
    const indexPath = join(requestPath, basename(entrypoint));
    if (entrypoint === indexPath && indexPath in files) {
      return true;
    }
  }
  return entrypoint === requestPath && requestPath in files;
}

function isIndex(path: string): boolean {
  const ext = extname(path);
  const name = basename(path, ext);
  return name === 'index';
}
