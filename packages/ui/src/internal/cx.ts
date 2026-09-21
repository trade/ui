// SPDX-License-Identifier: MIT OR Apache-2.0
// SPDX-FileCopyrightText: 2019-present Iko <6572003+iap@users.noreply.github.com>

/** join class names, dropping falsy values */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
