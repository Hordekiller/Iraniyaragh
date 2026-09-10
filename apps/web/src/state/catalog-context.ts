import { createContext, useContext } from 'react'
import type { CatalogApi } from '../services/catalog/types'

export type CatalogContextValue = {
  api: CatalogApi
}

export const CatalogContext = createContext<CatalogContextValue | null>(null)

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext)
  if (!ctx) throw new Error('useCatalog must be used within CatalogProvider')
  return ctx
}

export function useCatalogApi(): CatalogApi {
  return useCatalog().api
}
