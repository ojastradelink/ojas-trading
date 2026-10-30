/**
 * class-transformer `@Transform` for address lists. From FormData they arrive as
 * a comma-separated string (or repeated fields); both normalise to a trimmed,
 * lower-cased, de-duplicated array.
 */
export const emailList = ({ value }: { value: unknown }) => {
  const raw = (Array.isArray(value) ? value : [value]).flatMap((v) => String(v ?? '').split(/[,;\s]+/));
  return [...new Set(raw.map((v) => String(v).trim().toLowerCase()).filter(Boolean))];
};
