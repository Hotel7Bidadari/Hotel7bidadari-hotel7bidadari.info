/* global globalThis */
export const waitUntil = promise => {
  const context = globalThis[Symbol.for('@vercel/request-context')].get();
  return context.waitUntil(promise);
};
