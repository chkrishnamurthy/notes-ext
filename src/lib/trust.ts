/**
 * What this install can actually do, read back from Chrome.
 *
 * The privacy claims are worth little if they only live in prose, so the
 * settings page shows them from the running extension: the permissions Chrome
 * has granted and whether the extension's own security policy forbids network
 * connections. Pure functions, so the rules can be tested without a browser.
 */

export interface GrantedAccess {
  permissions?: string[];
  origins?: string[];
}

export interface AccessSummary {
  permissions: string[];
  /** Access to every website, which only the quick-open button asks for. */
  allSites: boolean;
  /** Any narrower site grants, listed as Chrome reports them. */
  hosts: string[];
}

const ALL_SITE_PATTERNS = new Set(['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*']);

export function summarizeAccess(granted: GrantedAccess): AccessSummary {
  const origins = granted.origins ?? [];
  const allSites = origins.some((origin) => ALL_SITE_PATTERNS.has(origin));
  return {
    permissions: [...(granted.permissions ?? [])].sort((a, b) => a.localeCompare(b)),
    allSites,
    hosts: allSites ? [] : origins,
  };
}

/**
 * True when the policy forbids every network connection from extension pages:
 * a `connect-src` directive whose only source is `'none'`. A policy without
 * one falls back to `default-src`, which is not something to rely on here.
 */
export function blocksNetwork(csp: string | undefined): boolean {
  if (!csp) return false;
  return csp
    .split(';')
    .map((directive) => directive.trim().split(/\s+/))
    .some(([name, ...sources]) => name === 'connect-src' && sources.length === 1 && sources[0] === "'none'");
}
