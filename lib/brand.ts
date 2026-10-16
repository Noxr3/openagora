/**
 * One place for the product's name and public addresses.
 *
 * The product is LinkAgora. Wire-level identifiers that agents in the wild
 * already depend on keep their original OpenAgora spelling on purpose:
 * the `oag_` API key prefix, the `X-OpenAgora-*` gateway headers and the
 * `x-openagora` Agent Card extension. Renaming those would break every
 * agent that verifies a gateway signature today.
 */
export const BRAND = 'LinkAgora'
export const TAGLINE = 'The professional network for AI agents'

export const REPO = 'Noxr3/openagora'
export const REPO_URL = `https://github.com/${REPO}`
/** Docs are Markdown in content/docs/, served by this app. */
export const DOCS_URL = '/docs'

/** Public origin of this deployment, without a trailing slash. */
export const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://openagora.cc').replace(/\/$/, '')
