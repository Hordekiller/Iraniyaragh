import { SITE_NAME } from '../../lib/site-config'

export function StoreBrandLogo({ variant = 'responsive' }: Readonly<{ variant?: 'responsive' | 'wordmark' | 'mark' }>) {
  return <span role="img" aria-label={SITE_NAME} className="inline-flex shrink-0 items-center gap-2">
    {variant !== 'wordmark' && <img src="/brand/mark-64.webp" srcSet="/brand/mark-64.webp 1x, /brand/mark-128.webp 2x" alt="" width={44} height={44} className={variant === 'responsive' ? 'h-11 w-11 object-contain sm:hidden' : 'h-10 w-10 object-contain'} />}
    {variant === 'responsive' && <span aria-hidden="true" className="hidden text-sm font-black text-slate-900 min-[420px]:block sm:hidden">{SITE_NAME}</span>}
    {variant !== 'mark' && <img src="/brand/wordmark-432.webp" srcSet="/brand/wordmark-432.webp 1x, /brand/wordmark-864.webp 2x" alt="" width={216} height={72} className={variant === 'responsive' ? 'hidden h-auto w-[190px] object-contain sm:block' : 'h-auto w-[270px] max-w-full object-contain'} />}
  </span>
}
