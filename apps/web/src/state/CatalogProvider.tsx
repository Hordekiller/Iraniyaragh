import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { CatalogFixtureClient } from '../services/catalog/fixtures'
import { CatalogHttpClient } from '../services/catalog/http'
import type { CatalogApi } from '../services/catalog/types'
import { CatalogContext } from './catalog-context'

/**
 * Provides the storefront's catalog access port.
 *
 * Defaults to the real Catalog HTTP client. Fixtures remain an explicit local
 * development/e2e opt-in.
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
    return {
      api: api ?? (fixtureCatalogEnabled ? new CatalogFixtureClient() : new CatalogHttpClient({ baseUrl: import.meta.env.VITE_API_BASE_URL })),
    }
    // api is intentionally considered stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}
