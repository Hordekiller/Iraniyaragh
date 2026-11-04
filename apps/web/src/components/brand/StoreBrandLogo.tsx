import { SITE_NAME } from '../../lib/site-config'
import { brandAsset } from '../../lib/brand'

type LogoVariant = 'responsive' | 'wordmark' | 'mark' | 'inline'

/** The image's alternative text preserves the brand name without duplicate visible text. */
export function StoreBrandLogo({ variant = 'responsive' }: Readonly<{ variant?: LogoVariant }>) {
  if (variant === 'mark') return <img src={brandAsset('mark-64.webp')} srcSet={`${brandAsset('mark-64.webp')} 1x, ${brandAsset('mark-128.webp')} 2x`} alt={SITE_NAME} width={44} height={44} className="inline-block h-10 w-10 shrink-0 object-contain align-middle" />
  const widthClass = variant === 'inline' ? 'w-[100px]' : variant === 'responsive' ? 'w-[140px] sm:w-[190px]' : 'w-[270px]'
  return <img src={brandAsset('wordmark-432.webp')} srcSet={`${brandAsset('wordmark-432.webp')} 432w, ${brandAsset('wordmark-864.webp')} 864w`} sizes={variant === 'inline' ? '100px' : variant === 'responsive' ? '(min-width: 640px) 190px, 140px' : '270px'} alt={SITE_NAME} width={432} height={147} className={`inline-block h-auto max-w-full shrink-0 object-contain align-middle ${widthClass}`} />
}
