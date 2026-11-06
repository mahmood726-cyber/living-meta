'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'ci.yml'), 'utf8');

function triggerBranches(event) {
  const lines = workflow.split(/\r?\n/);
  const idx = lines.findIndex(line => line === '  ' + event + ':');
  if (idx < 0 || idx + 1 >= lines.length) return [];
  const match = lines[idx + 1].match(/^    branches: \[([^\]]+)\]$/);
  return match ? match[1].split(',').map(value => value.trim()) : [];
}

test('CI runs for pushes to the actual default branch master', () => {
  assert.ok(triggerBranches('push').includes('master'));
});

test('CI runs for PRs targeting the actual default branch master', () => {
  assert.ok(triggerBranches('pull_request').includes('master'));
});

test('artifact uploads use supported actions/upload-artifact@v4', () => {
  const actions = [...workflow.matchAll(/uses:\s*actions\/upload-artifact@(v\d+)/g)].map(match => match[1]);
  assert.equal(actions.length, 3, 'expected uploads for validation, bundle, and accessibility');
  assert.ok(actions.every(version => version === 'v4'));
});

test('a main-only workflow would fail this master-branch contract', () => {
  assert.ok(!'[main, develop]'.split(/[,\[\] ]+/).includes('master'));
});
