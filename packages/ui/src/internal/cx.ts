// SPDX-License-Identifier: MIT OR Apache-2.0

/** join class names, dropping falsy values */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
