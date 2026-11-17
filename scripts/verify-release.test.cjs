const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const script = resolve(__dirname, 'verify-release.sh');
test('production stays on main; prerelease auto-releases use prerelease history', () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-test-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const verify = (sha, ref = 'refs/heads/main', cwd = dir, channel = 'production', event = 'workflow_dispatch') => spawnSync('bash', [script, sha, channel], {
    cwd, env: { ...process.env, GITHUB_REF: ref, GITHUB_EVENT_NAME: event }, encoding: 'utf8'
  }).status;
  try {
    git('init', '-b', 'main');
    git('config', 'user.name', 'Release Test');
    git('config', 'user.email', 'test@example.invalid');
    git('commit', '--allow-empty', '-m', 'ancestor');
    const ancestor = git('rev-parse', 'HEAD');
    git('commit', '--allow-empty', '-m', 'main');
    const main = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/main', main);
    git('checkout', '-b', 'unreviewed', ancestor);
    git('commit', '--allow-empty', '-m', 'unreviewed');
    const unreviewed = git('rev-parse', 'HEAD');
    assert.equal(verify(ancestor), 0);
    assert.equal(verify(main), 0);
    for (const sha of [unreviewed, 'a'.repeat(40), main.slice(0, 7), '--help']) assert.notEqual(verify(sha), 0);
    assert.notEqual(verify(main, 'refs/heads/unreviewed'), 0);
    assert.notEqual(verify(main, 'refs/tags/main'), 0);
    git('update-ref', 'refs/remotes/origin/unreviewed', unreviewed);
    for (const event of ['push', 'workflow_dispatch']) {
      assert.notEqual(verify(unreviewed, 'refs/heads/unreviewed', dir, 'prerelease', event), 0);
      assert.notEqual(verify(main, 'refs/heads/main', dir, 'prerelease', event), 0);
    }
    assert.notEqual(verify(main, 'refs/tags/main', dir, 'prerelease'), 0);
    assert.notEqual(verify(main, 'refs/heads/main', dir, 'other'), 0);
    git('update-ref', 'refs/remotes/origin/prerelease', unreviewed);
    for (const event of ['push', 'workflow_dispatch']) {
      assert.equal(verify(unreviewed, 'refs/heads/prerelease', dir, 'prerelease', event), 0);
      assert.equal(verify(ancestor, 'refs/heads/prerelease', dir, 'prerelease', event), 0);
      assert.notEqual(verify(main, 'refs/heads/prerelease', dir, 'prerelease', event), 0);
      assert.notEqual(verify(unreviewed, 'refs/heads/prerelease', dir, 'production', event), 0);
      assert.notEqual(verify(unreviewed, 'refs/heads/main', dir, 'production', event), 0);
    }
    assert.notEqual(verify(unreviewed, 'refs/pull/1/merge', dir, 'prerelease', 'pull_request'), 0);
    git('tag', '-a', 'release', main, '-m', 'tag');
    assert.notEqual(verify(git('rev-parse', 'release')), 0);
    git('clone', '--depth', '1', '--branch', 'main', `file://${dir}`, join(dir, 'shallow'));
    assert.notEqual(verify(main, 'refs/heads/main', join(dir, 'shallow')), 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
