import type { CatalogCategory } from '../services/catalog/types'

/** Preserve the public hierarchy; malformed historical cycles cannot hang a request. */
export function categoryAncestors(categories: CatalogCategory[], currentId: string) {
  const byId = new Map(categories.map(category => [category.id, category]))
  const ancestors: CatalogCategory[] = []
  const visited = new Set([currentId])
  let parentId = byId.get(currentId)?.parentId
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    ancestors.unshift(parent)
    parentId = parent.parentId
  }
  return ancestors
}
