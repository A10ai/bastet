// No-op mock for "server-only" package
// The real package throws at import time outside of server contexts.
// This mock allows vitest to import files that use `import "server-only"`.
export {};