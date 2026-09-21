// SPDX-License-Identifier: MIT OR Apache-2.0
// SPDX-FileCopyrightText: 2019-present Iko <6572003+iap@users.noreply.github.com>

// Unit tests for the token source contract (ADR-001): the role set is identical across themes,
// every role is a primitive reference (never a literal), and the frozen scales keep their shape.
// build-tokens.mjs enforces these at build time; these pin the same invariants independently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(root, 'packages', 'tokens', 'tokens.json'), 'utf8'));

test('every theme declares the identical role set', () => {
  const themes = Object.entries(tokens.themes);
  assert.ok(themes.length >= 3, 'expected at least light, dark and high-contrast');
  const [firstName, firstRoles] = themes[0];
  const reference = Object.keys(firstRoles).sort();
  assert.ok(reference.length > 0);
  for (const [name, roles] of themes) {
    assert.deepEqual(Object.keys(roles).sort(), reference, `${name} diverges from ${firstName}`);
  }
});

test('every role is a primitive reference, never a literal', () => {
  for (const [themeName, roles] of Object.entries(tokens.themes)) {
    for (const [role, value] of Object.entries(roles)) {
      assert.match(String(value), /^\{[^}]+\}$/, `${themeName}.${role} = ${value} must be a {reference}`);
    }
  }
});

test('every primitive reference resolves', () => {
  const walk = (obj, path) => {
    const segments = path.split('.');
    return segments.reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
  };
  for (const [themeName, roles] of Object.entries(tokens.themes)) {
    for (const [role, value] of Object.entries(roles)) {
      const target = walk(tokens.primitive, String(value).slice(1, -1));
      assert.notEqual(target, undefined, `${themeName}.${role} -> ${value} does not resolve`);
      // a group target ({colour.indigo}) would emit var(--ui-ref-indigo), which is never defined:
      // only leaves become variables. build-tokens.mjs rejects it; this pins the same rule here.
      assert.ok(
        typeof target === 'string' || typeof target === 'number',
        `${themeName}.${role} -> ${value} resolves to a group, not a scalar leaf`
      );
    }
  }
});

test('the frozen scales keep their shape', () => {
  assert.equal(Object.keys(tokens.primitive.space).length, 9, 'the 9-step space scale');
  assert.deepEqual(
    [tokens.primitive.density.comfortable, tokens.primitive.density.compact, tokens.primitive.density.dense],
    [1, 0.75, 0.625]
  );
  assert.equal(tokens.primitive.motion.enabled, false, 'motion is off by default (ADR-004)');
  assert.equal(tokens.defaultTheme, 'light');
  assert.equal(tokens.cssVariablePrefix, '--ui-');
});
