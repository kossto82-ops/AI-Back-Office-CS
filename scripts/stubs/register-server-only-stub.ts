import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type ResolveFilename = (
  request: string,
  parent: unknown,
  isMain?: boolean,
  options?: unknown
) => string;

const require = createRequire(import.meta.url);
const moduleCtor = require('module') as unknown as {
  _resolveFilename: ResolveFilename;
};
const noopTarget = join(
  dirname(fileURLToPath(import.meta.url)),
  'server-only-noop.cjs'
);
const originalResolve: ResolveFilename = moduleCtor._resolveFilename;

/**
 * Redirects the bare `server-only` import to an empty module so Node-side
 * verification scripts can execute server-only modules outside the Next.js
 * bundler. Must be called before any dynamic import that pulls in a module
 * with `import 'server-only'`.
 */
export function registerServerOnlyStub(): void {
  moduleCtor._resolveFilename = function (
    request: string,
    parent: unknown,
    isMain?: boolean,
    options?: unknown
  ): string {
    if (request === 'server-only') {
      return noopTarget;
    }
    return originalResolve.call(this as never, request, parent, isMain, options);
  };
}