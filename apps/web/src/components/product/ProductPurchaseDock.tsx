import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Menu, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MobileBottomNav } from '../layout/MobileBottomNav';
import { useAuth } from '../../state/auth-context';
import { ROUTES } from '../../lib/routes';

/** One mobile surface; purchase state and controls remain mounted while switching. */
export function ProductPurchaseDock({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<'price' | 'menu'>('price');
  const section = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const auth = useAuth();

  useEffect(() => {
    const node = section.current;
    if (!node) return;
    const measure = () => {
      const height = Math.ceil(node.getBoundingClientRect().height);
      if (height > 0)
        document.documentElement.style.setProperty('--product-dock-height', `${height}px`);
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      document.documentElement.style.removeProperty('--product-dock-height');
    };
  }, []);

  return (
    <section
      ref={section}
      id="product-purchase"
      aria-label="کنترل‌های خرید و ناوبری محصول"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgb(15_23_42_/_0.08)] lg:static lg:mt-5 lg:rounded-2xl lg:border lg:p-5 lg:shadow-none"
    >
      <div
        role="group"
        aria-label="نمایش نوار پایین محصول"
        className="relative mx-auto mb-3 grid max-w-sm grid-cols-2 rounded-full bg-slate-100 p-1 lg:hidden"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-1 right-1 w-[calc(50%_-_0.25rem)] rounded-full bg-white shadow-sm transition-transform duration-250 ease-out motion-reduce:transition-none"
          style={{ transform: panel === 'price' ? 'translateX(0)' : 'translateX(-100%)' }}
        />
        <button
          type="button"
          aria-pressed={panel === 'price'}
          aria-controls="product-price-panel"
          onClick={() => setPanel('price')}
          className={`relative flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 ${panel === 'price' ? 'text-orange-800' : 'text-slate-600'}`}
        >
          <ShoppingBag size={16} aria-hidden="true" /> قیمت و خرید
        </button>
        <button
          type="button"
          aria-pressed={panel === 'menu'}
          aria-controls="product-menu-panel"
          onClick={() => setPanel('menu')}
          className={`relative flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 ${panel === 'menu' ? 'text-orange-800' : 'text-slate-600'}`}
        >
          <Menu size={16} aria-hidden="true" /> منوی سایت
        </button>
      </div>
      <div
        id="product-price-panel"
        role="region"
        aria-label="قیمت و خرید محصول"
        data-active={panel === 'price'}
        className="product-dock-price min-h-26 lg:min-h-0"
      >
        {children}
      </div>
      <div
        id="product-menu-panel"
        data-active={panel === 'menu'}
        aria-hidden={panel !== 'menu'}
        className="product-dock-menu min-h-26 items-center"
      >
        <MobileBottomNav
          embedded
          onOpenSearch={() => navigate(ROUTES.search)}
          onOpenLogin={auth.open}
        />
      </div>
    </section>
  );
}
