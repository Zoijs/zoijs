// @zoijs/i18n — tiny, reactive internationalization for Zoijs.

/** A plural message: pick the entry by the count's plural category. */
export interface PluralMessage {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  /** Required fallback category. */
  other: string;
}

/** A message is a plain interpolated string, or a plural object. */
export type Message = string | PluralMessage;

/** One locale's messages. Nest objects for dotted keys (`"nav.home"`). */
export interface MessageTable {
  [key: string]: Message | MessageTable;
}

/** All locales' messages, keyed by locale tag. */
export type Messages = Record<string, MessageTable>;

/** Interpolation/plural variables. `count` drives plural selection. */
export interface Vars {
  count?: number;
  [name: string]: unknown;
}

export interface I18nOptions {
  /** The starting locale (a BCP-47 tag, e.g. "en", "fr-CA"). */
  locale: string;
  /** Locale to fall back to for missing keys. Defaults to `locale`. */
  fallback?: string;
  /** Initial message catalog. */
  messages?: Messages;
}

/** A reactive i18n instance. Reader methods (t/locale/n/d/list) are reactive. */
export interface I18n {
  /** Translate a key with optional interpolation/plural vars (reactive). */
  t(key: string, vars?: Vars): string;
  /** Does this key resolve in the current or fallback locale? (reactive) */
  has(key: string): boolean;
  /** The current locale (reactive). */
  locale(): string;
  /** Switch locale; every translation/format binding updates. */
  setLocale(locale: string): void;
  /** Merge more messages into a locale (e.g. a lazily-loaded bundle). */
  add(locale: string, messages: MessageTable): void;
  /** Format a number in the current locale (reactive). */
  n(value: number | bigint, options?: Intl.NumberFormatOptions): string;
  /** Format a date in the current locale (reactive). */
  d(value: Date | number, options?: Intl.DateTimeFormatOptions): string;
  /** Format a list in the current locale (reactive). */
  list(values: Iterable<string>, options?: Intl.ListFormatOptions): string;
}

/** Create a reactive i18n instance. */
export function createI18n(options: I18nOptions): I18n;
