/** The waters of a permit's type (which the permit covers, BR-01) with their names, by name. */
export function permitWaters(
  waters: { id: string }[],
  names: Map<string, string>,
): { id: string; name: string }[] {
  return waters
    .map((water) => ({ id: water.id, name: names.get(water.id) ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl') || a.id.localeCompare(b.id));
}
