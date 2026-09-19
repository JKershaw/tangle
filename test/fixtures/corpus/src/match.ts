/** Query matching for filters. */

// True when every key of the filter matches the document.
export function matchesFilter(doc: any, filter: any): boolean {
  return Object.keys(filter).every((key) => matchesKey(doc[key], filter[key]));
}

function matchesKey(value: any, wanted: any): boolean {
  if (wanted && typeof wanted === 'object' && '$gt' in wanted) return value > wanted.$gt;
  return value === wanted;
}
