// The one place that decides which attributes of a field definition are
// persisted, so the form's dirty check and its submit serializer can't diverge.
// - `options` only for dropdown fields; switching away drops it.
// - `suggestOptions` only (as true) for text fields.
// - `main`, `excludeFromSearch`, `prefix` and `suffix` only when set (prefix and
//   suffix are never trimmed so ' pages' keeps its leading space).
export function normalizeFieldDef({
  name,
  type,
  options,
  main,
  excludeFromSearch,
  suggestOptions,
  prefix,
  suffix,
}) {
  const fieldType = type ?? 'text'
  return {
    name: (name ?? '').trim(),
    type: fieldType,
    ...(fieldType === 'dropdown' && { options: (options ?? []).map((option) => option.trim()) }),
    ...(main && { main: true }),
    ...(excludeFromSearch && { excludeFromSearch: true }),
    ...(fieldType === 'text' && suggestOptions && { suggestOptions: true }),
    ...(prefix && { prefix }),
    ...(suffix && { suffix }),
  }
}
