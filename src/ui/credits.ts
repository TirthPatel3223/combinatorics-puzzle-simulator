/**
 * Credits shared by every puzzle panel: the producer's and designers' names (linked to their official
 * sites where they have one) and a disclaimer that this is an unofficial fan project.
 *
 * The credit is plain text on purpose: no logos, which are their owners' trademarks and would make the
 * simulator look officially endorsed.
 */

export const CREDIT_LINKS = {
  mefferts: 'https://www.mefferts.com/',
  oskar: 'https://oskarvandeventer.nl/',
  tom: 'https://www.tomvanderzanden.nl/',
} as const;

/** An external link that opens in a new tab. */
export function creditLink(text: string, href: string): string {
  return `<a class="credit-link" href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

export const MEFFERTS = creditLink('Meffert&#39;s', CREDIT_LINKS.mefferts);
export const OSKAR = creditLink('Oskar van Deventer', CREDIT_LINKS.oskar);
export const TOM = creditLink('Tom van der Zanden', CREDIT_LINKS.tom);

export const DISCLAIMER =
  'Fan-made simulator. Not affiliated with or endorsed by DaYan, Meffert’s or the puzzle designers. ' +
  'Puzzle names and trademarks belong to their owners.';

export const DISCLAIMER_HTML = /* html */ `<p class="disclaimer">${DISCLAIMER}</p>`;
