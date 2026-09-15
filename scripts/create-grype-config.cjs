const exceptions = require('../security/vulnerability-exceptions.json');

function createGrypeConfig(entries, now = new Date()) {
  const ignore = [];
  for (const { vulnerability, package: pkg, expires, reason } of entries) {
    const deadline = new Date(`${expires}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)
      || !Number.isFinite(deadline.getTime())
      || deadline.toISOString().slice(0, 10) !== expires) {
      throw new Error(`Invalid exception expiration for ${vulnerability}`);
    }
    if (!vulnerability || !pkg?.name || !pkg?.version || !pkg?.type || !reason?.trim()) {
      throw new Error(`Exception requires a vulnerability, exact package, and reason: ${vulnerability}`);
    }
    if (now < deadline) {
      ignore.push({ vulnerability, package: { name: pkg.name, version: pkg.version, type: pkg.type } });
    }
  }
  return { ignore };
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(createGrypeConfig(exceptions), null, 2)}\n`);
}

module.exports = { createGrypeConfig };
