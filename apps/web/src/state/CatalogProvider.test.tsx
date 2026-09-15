import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CatalogProvider } from '../state/CatalogProvider'
import { useCatalogApi } from '../state/catalog-context'
import type { CatalogApi } from '../services/catalog/types'

const api: CatalogApi = {
  listCategories: vi.fn(async () => []),
  listProducts: vi.fn(async () => ({ items: [], meta: { page: 1, perPage: 24, total: 0, pages: 0 } })),
  getProductBySlug: vi.fn(async () => { throw new Error('nope') }),
}

describe('CatalogProvider', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('provides an injected api through useCatalog', () => {
    function Probe() {
      const provided = useCatalogApi()
      return <span data-testid="catalog-provided">{provided === api ? 'yes' : 'no'}</span>
    }
    render(
      <CatalogProvider api={api}>
        <Probe />
      </CatalogProvider>,
    )
    expect(screen.getByTestId('catalog-provided')).toHaveTextContent('yes')
  })

  it('throws fail-closed when no api and the fixture flag is off', () => {
    expect(() =>
      render(
        <CatalogProvider>
          <span>x</span>
        </CatalogProvider>,
      ),
    ).toThrow('CatalogProvider: the fixture catalog client is not enabled in this build.')
  })

  it('serves the fixture client when VITE_FIXTURE_CATALOG=true', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_FIXTURE_CATALOG', 'true')
    const freshCatalog = await import('../state/CatalogProvider')
    const freshCtx = await import('../state/catalog-context')
    function Probe() {
      const catalog = freshCtx.useCatalogApi()
      return <span data-testid="fixture-catalog">{typeof catalog.listCategories === 'function' ? 'ready' : 'no'}</span>
    }
    render(
      <freshCatalog.CatalogProvider>
        <Probe />
      </freshCatalog.CatalogProvider>,
    )
    expect(screen.getByTestId('fixture-catalog')).toHaveTextContent('ready')
  })
})