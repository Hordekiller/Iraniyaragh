import type { CatalogCategory } from '../services/catalog/types'

export type CategoryNode = { category: CatalogCategory; children: CategoryNode[] }

/**
 * Builds the parent/child tree from the flat list the catalog API returns.
 *
 * A parent reference that points outside the delivered list is treated as a root,
 * so a category is never dropped just because its parent was not delivered. A
 * parent reference cycle resolves to no root at all, so the whole list is used as
 * roots; the descent tracks every ancestor, which also makes the recursion
 * terminate on corrupt data instead of hanging the render.
 */
export function buildCategoryTree(categories: readonly CatalogCategory[]): CategoryNode[] {
  if (categories.length === 0) return []

  const byParent = new Map<string, CatalogCategory[]>()
  for (const category of categories) {
    if (!category.parentId) continue
    const siblings = byParent.get(category.parentId)
    if (siblings) siblings.push(category)
    else byParent.set(category.parentId, [category])
  }

  const resolved = categories.filter(
    category => !category.parentId || !categories.some(candidate => candidate.id === category.parentId),
  )
  const roots = resolved.length > 0 ? resolved : [...categories]

  const build = (category: CatalogCategory, seen: ReadonlySet<string>): CategoryNode => ({
    category,
    children: (byParent.get(category.id) ?? [])
      .filter(child => !seen.has(child.id))
      .map(child => build(child, new Set([...seen, category.id]))),
  })

  return roots.map(root => build(root, new Set([root.id])))
}
