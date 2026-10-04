import type { CategorySummary } from '@iranyaragh/contracts';

export function categoryDescendants(categories: readonly CategorySummary[], rootId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const category of categories) {
    if (category.parentId) {
      const siblings = children.get(category.parentId) ?? [];
      siblings.push(category.id); children.set(category.parentId, siblings);
    }
  }
  const visited = new Set<string>();
  const pending = [rootId];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  return visited;
}

export function categoryPaths(categories: readonly CategorySummary[]): Map<string, string> {
  const byId = new Map(categories.map(category => [category.id, category]));
  const paths = new Map<string, string>();
  for (const category of categories) {
    const chain: CategorySummary[] = [];
    const visited = new Set<string>();
    let current: CategorySummary | undefined = category;
    while (current && !paths.has(current.id) && !visited.has(current.id)) {
      visited.add(current.id); chain.push(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    let path = current ? paths.get(current.id) ?? '' : '';
    for (const item of chain.reverse()) { path = path ? `${path} / ${item.name}` : item.name; paths.set(item.id, path); }
  }
  return paths;
}
