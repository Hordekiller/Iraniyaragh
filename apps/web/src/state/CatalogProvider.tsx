import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
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
 *
 * The fixture module is reached through a **dynamic** `import()` on purpose. A
 * static import would put the hand-authored fixture catalog in the production
 * entry chunk even though the branch above is statically false, which
 * `scripts/check-bundle-fixtures.mjs` fails the build for. Production therefore
 * resolves the HTTP client synchronously on the first render and no fixture code
 * is ever downloaded.
 */
const fixtureCatalogEnabled = import.meta.env.VITE_FIXTURE_CATALOG === 'true'

function buildHttpCatalogApi(): CatalogApi {
  return new CatalogHttpClient({ baseUrl: import.meta.env.VITE_API_BASE_URL })
}

export function CatalogProvider({
  children,
  api,
}: {
  children: ReactNode
  api?: CatalogApi
}) {
  // HTTP is the production default, so that client is built during render; only
  // the lazy fixture import has to be resolved asynchronously.
  const [fixtureApi, setFixtureApi] = useState<CatalogApi | null>(null)
  const needsFixture = !api && fixtureCatalogEnabled

  useEffect(() => {
    if (!needsFixture) return undefined
    let cancelled = false
    void import('../services/catalog/fixtures').then(({ CatalogFixtureClient }) => {
      if (!cancelled) setFixtureApi(new CatalogFixtureClient())
    })
    return () => {
      cancelled = true
    }
  }, [needsFixture])

  const httpApi = useMemo(
    () => (api || fixtureCatalogEnabled ? null : buildHttpCatalogApi()),
    [api],
  )
  const resolved = api ?? httpApi ?? fixtureApi

  const value = useMemo(() => (resolved ? { api: resolved } : null), [resolved])

  // Only reachable in fixture mode, before the lazy fixture client resolves.
  if (!value) return null

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}
