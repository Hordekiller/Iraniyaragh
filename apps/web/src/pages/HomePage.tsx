import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Product } from '../types/content'
import { HeroSlider } from '../components/hero/HeroSlider'
import { CategoryGrid } from '../components/catalog/CategoryGrid'
import { PopularTools } from '../components/catalog/PopularTools'
import { Bestsellers } from '../components/catalog/Bestsellers'
import { SpecialCollection } from '../components/catalog/SpecialCollection'
import { BlogSection } from '../components/content/BlogSection'
import { ServicesSection } from '../components/content/ServicesSection'
import { NewsletterBrands } from '../components/content/NewsletterBrands'
import { ROUTES } from '../lib/routes'
import { SECTION_IDS } from '../lib/site-config'

type HomePageLocationState = {
  scrollToCategories?: boolean
}

export function HomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const handledKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const state = location.state as HomePageLocationState | null
    if (!state?.scrollToCategories) return
    if (handledKeyRef.current === location.key) return
    handledKeyRef.current = location.key
    document.getElementById(SECTION_IDS.categories)?.scrollIntoView({ behavior: 'smooth' })
    navigate(ROUTES.home, { replace: true, state: {} })
  }, [location.state, location.key, navigate])

  function handleSelectProduct(product: Product) {
    if (product.slug) {
      navigate(ROUTES.product(product.slug))
    }
  }

  return (
    <div>
      <HeroSlider />
      <CategoryGrid />
      <PopularTools onSelectProduct={handleSelectProduct} />

      <section className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-6 grid lg:grid-cols-12 gap-6">
        <Bestsellers onSelectProduct={handleSelectProduct} />
        <SpecialCollection onSelectProduct={handleSelectProduct} />
      </section>

      <BlogSection />
      <ServicesSection />
      <NewsletterBrands />
    </div>
  )
}
