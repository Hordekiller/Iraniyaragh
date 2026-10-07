import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/feedback/Toast'
import { AuthProvider } from './state/AuthProvider'
import { CatalogProvider } from './state/CatalogProvider'
import { CartProvider } from './state/CartProvider'
import { AppLayout } from './components/layout/AppLayout'
import { HomePage } from './pages/HomePage'
import { ROUTE_PATHS } from './lib/routes'

const CategoryPage = lazy(() => import('./pages/CategoryPage').then(module => ({ default: module.CategoryPage })))
const ProductPage = lazy(() => import('./pages/ProductPage').then(module => ({ default: module.ProductPage })))
const SearchPage = lazy(() => import('./pages/SearchPage').then(module => ({ default: module.SearchPage })))
const BestsellersPage = lazy(() => import('./pages/BestsellersPage').then(module => ({ default: module.BestsellersPage })))
const CartPage = lazy(() => import('./pages/CartPage').then(module => ({ default: module.CartPage })))
const CheckoutPage = lazy(() => import('./pages/CheckoutPage').then(module => ({ default: module.CheckoutPage })))
const PaymentPage = lazy(() => import('./pages/PaymentPage').then(module => ({ default: module.PaymentPage })))
const PaymentReturnPage = lazy(() => import('./pages/PaymentReturnPage').then(module => ({ default: module.PaymentReturnPage })))
const AccountPage = lazy(() => import('./pages/AccountPage').then(module => ({ default: module.AccountPage })))
const AccountAddressesPage = lazy(() => import('./pages/AccountAddressesPage').then(module => ({ default: module.AccountAddressesPage })))
const AccountSecurityPage = lazy(() => import('./pages/AccountSecurityPage').then(module => ({ default: module.AccountSecurityPage })))
const OrdersPage = lazy(() => import('./pages/OrdersPage').then(module => ({ default: module.OrdersPage })))
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage').then(module => ({ default: module.OrderDetailPage })))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then(module => ({ default: module.PrivacyPage })))
const TermsPage = lazy(() => import('./pages/TermsPage').then(module => ({ default: module.TermsPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(module => ({ default: module.NotFoundPage })))

function RouteLoading() {
  return (
    <div className="max-w-[1280px] mx-auto px-4 py-20 text-center text-slate-500" role="status">
      در حال بارگذاری...
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <CatalogProvider>
            <CartProvider>
                <Suspense fallback={<RouteLoading />}>
                  <Routes>
                    <Route element={<AppLayout />}>
                      <Route path={ROUTE_PATHS.home} element={<HomePage />} />
                      <Route path={ROUTE_PATHS.category} element={<CategoryPage />} />
                      <Route path={ROUTE_PATHS.product} element={<ProductPage />} />
                      <Route path={ROUTE_PATHS.search} element={<SearchPage />} />
                      <Route path={ROUTE_PATHS.bestsellers} element={<BestsellersPage />} />
                      <Route path={ROUTE_PATHS.cart} element={<CartPage />} />
                      <Route path={ROUTE_PATHS.checkout} element={<CheckoutPage />} />
                      <Route path={ROUTE_PATHS.payment} element={<PaymentPage />} />
                      <Route path={ROUTE_PATHS.paymentResult} element={<PaymentPage returnMode />} />
                      <Route path={ROUTE_PATHS.paymentReturn} element={<PaymentReturnPage />} />
                      <Route path={ROUTE_PATHS.account} element={<AccountPage />} />
                      <Route path={ROUTE_PATHS.addresses} element={<AccountAddressesPage />} />
                      <Route path={ROUTE_PATHS.sessions} element={<AccountSecurityPage />} />
                      <Route path={ROUTE_PATHS.orders} element={<OrdersPage />} />
                      <Route path={ROUTE_PATHS.order} element={<OrderDetailPage />} />
                      <Route path={ROUTE_PATHS.privacy} element={<PrivacyPage />} />
                      <Route path={ROUTE_PATHS.terms} element={<TermsPage />} />
                      <Route path="*" element={<NotFoundPage />} />
                    </Route>
                  </Routes>
                </Suspense>
            </CartProvider>
          </CatalogProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
