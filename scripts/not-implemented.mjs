// Shared stub for workspace scripts that are reserved but not yet implemented,
// so `npm run <name>` fails clearly instead of silently reporting success.
const [, , name, reason] = process.argv;
console.error(`[${name}] not implemented yet: ${reason}`);
process.exitCode = 1;
