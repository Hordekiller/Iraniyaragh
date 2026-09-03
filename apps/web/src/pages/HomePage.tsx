import { useState } from 'react'
import type { Product } from '../types/content'
import { TopBar } from '../components/layout/TopBar'
import { SiteHeader } from '../components/layout/SiteHeader'
import { MobileBottomNav } from '../components/layout/MobileBottomNav'
import { SiteFooter } from '../components/layout/SiteFooter'
import { HeroSlider } from '../components/hero/HeroSlider'
import { CategoryGrid } from '../components/catalog/CategoryGrid'
import { PopularTools } from '../components/catalog/PopularTools'
import { SearchResults } from '../components/catalog/SearchResults'
import { Bestsellers } from '../components/catalog/Bestsellers'
import { SpecialCollection } from '../components/catalog/SpecialCollection'
import { BlogSection } from '../components/content/BlogSection'
import { ServicesSection } from '../components/content/ServicesSection'
import { NewsletterBrands } from '../components/content/NewsletterBrands'
import { ProductModal } from '../components/feedback/ProductModal'

type HomePageProps = {
  onOpenLogin: () => void
}

export function HomePage({ onOpenLogin }: HomePageProps) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  return (
    <>
      <TopBar />
      <SiteHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showSearch={showSearch}
        onToggleSearch={() => setShowSearch(s => !s)}
        onOpenLogin={onOpenLogin}
      />
      <main>
        <HeroSlider />
        <SearchResults query={searchQuery.trim()} onSelectProduct={setSelectedProduct} />
        <CategoryGrid />
        <PopularTools onSelectProduct={setSelectedProduct} />

        <section className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-6 grid lg:grid-cols-12 gap-6">
          <Bestsellers onSelectProduct={setSelectedProduct} />
          <SpecialCollection onSelectProduct={setSelectedProduct} />
        </section>

        <BlogSection />
        <ServicesSection />
        <NewsletterBrands />
      </main>
      <SiteFooter />

      <MobileBottomNav onOpenSearch={() => setShowSearch(true)} onOpenLogin={onOpenLogin} />
      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </>
  )
}