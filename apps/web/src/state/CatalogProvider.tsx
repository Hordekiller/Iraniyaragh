import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { CatalogFixtureClient } from '../services/catalog/fixtures'
import type { CatalogApi } from '../services/catalog/types'
import { CatalogContext } from './catalog-context'

/**
 * Provides the storefront's catalog access port.
 *
 * Defaults to the contract fixture client so the storefront can run/demo the
 * colorway before the catalog backend endpoints land on `main` (parallel-work
 * model). A caller-supplied `api` (a real `CatalogHttpClient`) always wins.
 *
 * Fail-closed: in a shipped build the fixture is only authorized when an
 * explicit `VITE_FIXTURE_CATALOG=true` opt-in is supplied (local dev / e2e),
 * so a deployment cannot silently ship fake catalog data.
 */
const fixtureCatalogEnabled = import.meta.env.VITE_FIXTURE_CATALOG === 'true'

export function CatalogProvider({
  children,
  api,
}: {
  children: ReactNode
  api?: CatalogApi
}) {
  const value = useMemo(() => {
    if (!api && !fixtureCatalogEnabled) {
      throw new Error(
        'CatalogProvider: the fixture catalog client is not enabled in this build. ' +
          'Wire a real CatalogHttpClient or set VITE_FIXTURE_CATALOG=true for local dev/e2e only.',
      )
    }
    return { api: api ?? new CatalogFixtureClient() }
    // api is intentionally considered stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}
