#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Copy the repository licence files into the publishable workspace packages.
 *
 * npm only packs files that live inside the package directory, so a package whose `files`
 * whitelist is `dist` would ship code with none of the terms it declares. The package
 * manifests list the licence files in `files`; this makes them exist before `npm pack`/publish
 * (wired as each package's `prepack`).
 */
import { copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LICENCE_FILES = ['LICENSE', 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE'];
const PACKAGES = ['packages/ui', 'packages/tokens'];

let copied = 0;
for (const pkg of PACKAGES) {
  const from = (file) => resolve(root, file);
  const to = (file) => resolve(root, pkg, file);
  if (!existsSync(resolve(root, pkg, 'package.json'))) continue;
  for (const file of LICENCE_FILES) {
    if (!existsSync(from(file))) continue;
    copyFileSync(from(file), to(file));
    copied += 1;
  }
}

console.log(`licences copied: ${copied} file(s) into ${PACKAGES.join(', ')}`);
