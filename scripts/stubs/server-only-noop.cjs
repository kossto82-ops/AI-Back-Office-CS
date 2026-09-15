// Runtime-only stub for the bare "server-only" specifier.
// Used exclusively by Node-side verification scripts (scripts/verify-ai-pipeline)
// that exercise server-only modules. Production code is never affected:
// the stub is only registered via registerServerOnlyStub() inside the verify script,
// Next.js still resolves the real "server-only" package and enforces the guard.
module.exports = {};