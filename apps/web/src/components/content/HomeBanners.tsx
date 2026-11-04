import { Link } from 'react-router-dom'
import type { HomepageBannerPublic } from '@iranyaragh/contracts'

function BannerLink({ href, className, children, label }: { href: string; className: string; children: React.ReactNode; label: string }) {
  return href.startsWith('/')
    ? <Link to={href} className={className} aria-label={label}>{children}</Link>
    : <a href={href} className={className} aria-label={label} rel="noopener noreferrer">{children}</a>
}

/** 2×2 promotional grid. Renders only admin-published banners; nothing when none are live. */
export function HomeBanners({ banners, loading = false }: { banners: HomepageBannerPublic[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:mt-14" role="status" aria-label="در حال دریافت بنرها">
        {[0, 1, 2, 3].map(n => <div key={n} className="aspect-[16/9] animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none sm:aspect-[2/1]" />)}
      </div>
    )
  }
  if (banners.length === 0) return null
  return (
    <section className="mt-10 lg:mt-14" aria-label="پیشنهادهای ویژه فروشگاه">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {banners.map((banner, index) => (
          <li key={banner.id}>
            <BannerLink
              href={banner.href}
              label={`${banner.title}؛ ${banner.ctaLabel}`}
              className="group relative block aspect-[16/9] overflow-hidden rounded-2xl bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2 sm:aspect-[2/1]"
            >
              <picture>
                {banner.mobileImage && <source media="(max-width: 639px)" srcSet={banner.mobileImage.url} />}
                <img
                  src={banner.desktopImage.url}
                  alt={banner.imageAlt}
                  width={banner.desktopImage.width}
                  height={banner.desktopImage.height}
                  loading={index < 2 ? 'eager' : 'lazy'}
                  decoding="async"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
              </picture>
              <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/75 via-black/40 to-transparent p-4 pt-12 text-white">
                <span className="text-base font-black sm:text-lg">{banner.title}</span>
                {banner.subtitle && <span className="text-xs text-slate-100 sm:text-sm">{banner.subtitle}</span>}
                <span className="mt-1 inline-flex self-start rounded-full bg-[#C2410C] px-3 py-1 text-xs font-bold">{banner.ctaLabel}</span>
              </span>
            </BannerLink>
          </li>
        ))}
      </ul>
    </section>
  )
}
