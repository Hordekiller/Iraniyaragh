import type { HTMLAttributes } from 'react';

type RichTextProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'dangerouslySetInnerHTML'
> & {
  html: string;
};

/**
 * Renders rich-text HTML returned by the trusted Catalog API.
 *
 * ADR-0016 requires the backend to sanitize description content on write and to
 * re-sanitize the projection on every read, so this component is the single
 * sanctioned `dangerouslySetInnerHTML` consumer in the storefront. It must never
 * be given client-authored or fixture-authored arbitrary HTML.
 */
export function RichText({ html, className, ...rest }: RichTextProps) {
  return (
    <div
      {...rest}
      data-rich-text="true"
      className={[
        'leading-7',
        '[&_h1]:mt-5 [&_h1]:text-xl [&_h1]:font-black',
        '[&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-black',
        '[&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-black',
        '[&_h4]:mt-3 [&_h4]:text-sm [&_h4]:font-bold',
        '[&_h5]:mt-3 [&_h5]:text-[13px] [&_h5]:font-bold',
        '[&_h6]:mt-3 [&_h6]:text-[13px] [&_h6]:font-bold',
        '[&_p]:mt-3',
        '[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pr-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pr-5',
        '[&_li]:mt-1',
        '[&_blockquote]:mt-3 [&_blockquote]:border-r-4 [&_blockquote]:border-slate-200 [&_blockquote]:pr-4 [&_blockquote]:text-slate-500',
        '[&_hr]:mt-4 [&_hr]:border-slate-200',
        '[&_a]:text-[#FF4D00] [&_a]:underline [&_a]:hover:text-[#E54400]',
        '[&_table]:mt-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
        '[&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-1 [&_th]:font-bold [&_th]:text-start',
        '[&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1',
        '[&_figure]:mt-4',
        '[&_figcaption]:mt-1 [&_figcaption]:text-xs [&_figcaption]:text-slate-500',
        '[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-xl',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}