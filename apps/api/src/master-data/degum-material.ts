/**
 * Codes the client uses for crude degummed soybean oil — the material whose
 * deals are tracked in the Degum section. Compared letters-only, upper-case.
 */
const DEGUM_CODES = ['CDSBO', 'CSBDO'];

/**
 * Default for a new product's Degum flag: a known degum code, or a name that
 * says "crude … degummed". The user can still untick / tick it in Products.
 * (The web product form mirrors this in lib/degum-config.ts.)
 */
export function looksDegum(code?: string | null, name?: string | null): boolean {
  const c = (code ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  if (DEGUM_CODES.includes(c)) return true;
  const n = (name ?? '').toLowerCase();
  return n.includes('crude') && n.includes('degum');
}
