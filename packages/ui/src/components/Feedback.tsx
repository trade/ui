// SPDX-License-Identifier: MIT OR Apache-2.0

import type { ReactNode } from 'react';
import { cx } from '../internal/cx';

export type FeedbackTone = 'info' | 'success' | 'warning' | 'danger';

export interface BannerProps {
  tone?: FeedbackTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Banner({ tone = 'info', title, children, className }: BannerProps) {
  return (
    <div className={cx('ui-banner', `ui-banner--${tone}`, className)} role="status">
      {title ? <span className="ui-banner__title">{title}</span> : null}
      {children ? <span className="ui-banner__body">{children}</span> : null}
    </div>
  );
}

export interface ToastProps {
  tone?: FeedbackTone;
  title?: ReactNode;
  children?: ReactNode;
}

/** Static toast — deliberately has no auto-dismiss timer or entry animation in v1. */
export function Toast({ tone = 'info', title, children }: ToastProps) {
  return (
    <div className={cx('ui-banner', 'ui-toast', `ui-banner--${tone}`)} role="status" aria-live="polite">
      {title ? <span className="ui-banner__title">{title}</span> : null}
      {children ? <span className="ui-banner__body">{children}</span> : null}
    </div>
  );
}

export interface ToastRegionProps {
  children?: ReactNode;
}

export function ToastRegion({ children }: ToastRegionProps) {
  return (
    <div className="ui-toast-region" role="region" aria-label="Notifications">
      {children}
    </div>
  );
}
