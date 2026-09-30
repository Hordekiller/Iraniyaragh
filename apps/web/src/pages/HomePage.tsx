import { useNavigate } from 'react-router-dom'
import type { CatalogProduct } from '../services/catalog/types'
import { HeroSlider } from '../components/hero/HeroSlider'
import { CategoryGrid } from '../components/catalog/CategoryGrid'
import { PopularTools } from '../components/catalog/PopularTools'
import { ServicesSection } from '../components/content/ServicesSection'
import { NewsletterBrands } from '../components/content/NewsletterBrands'
import { ROUTES } from '../lib/routes'
import { SITE_NAME, SITE_TAGLINE } from '../lib/site-config'
import { useDocumentMeta } from '../lib/use-document-meta'

export function HomePage() {
  const navigate = useNavigate()

  useDocumentMeta({ title: SITE_NAME, description: SITE_TAGLINE, canonicalPath: ROUTES.home })

  function handleSelectProduct(product: CatalogProduct) {
    navigate(ROUTES.product(product.slug))
  }

  return (
    <div>
      <HeroSlider />
      <CategoryGrid />
      <PopularTools onSelectProduct={handleSelectProduct} />
      <ServicesSection />
      <NewsletterBrands />
    </div>
  )
}
