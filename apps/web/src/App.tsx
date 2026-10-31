import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/feedback/Toast'
import { AuthProvider } from './state/AuthProvider'
import { CatalogProvider } from './state/CatalogProvider'
import { CartProvider } from './state/CartProvider'
import { AppLayout } from './components/layout/AppLayout'
import { HomePage } from './views/HomePage'
import { ROUTE_PATHS } from './lib/routes'

const CategoriesPage = lazy(() => import('./views/CategoriesPage').then(module => ({ default: module.CategoriesPage })))
const CategoryPage = lazy(() => import('./views/CategoryPage').then(module => ({ default: module.CategoryPage })))
const ProductPage = lazy(() => import('./views/ProductPage').then(module => ({ default: module.ProductPage })))
const SearchPage = lazy(() => import('./views/SearchPage').then(module => ({ default: module.SearchPage })))
const BestsellersPage = lazy(() => import('./views/BestsellersPage').then(module => ({ default: module.BestsellersPage })))
const CartPage = lazy(() => import('./views/CartPage').then(module => ({ default: module.CartPage })))
const CheckoutPage = lazy(() => import('./views/CheckoutPage').then(module => ({ default: module.CheckoutPage })))
const PaymentPage = lazy(() => import('./views/PaymentPage').then(module => ({ default: module.PaymentPage })))
const PaymentReturnPage = lazy(() => import('./views/PaymentReturnPage').then(module => ({ default: module.PaymentReturnPage })))
const AccountCreditPage = lazy(() => import('./views/AccountCreditPage').then(module => ({ default: module.AccountCreditPage })))
const AccountInvoicesPage = lazy(() => import('./views/AccountInvoicesPage').then(module => ({ default: module.AccountInvoicesPage })))
const AccountPage = lazy(() => import('./views/AccountPage').then(module => ({ default: module.AccountPage })))
const AccountAddressesPage = lazy(() => import('./views/AccountAddressesPage').then(module => ({ default: module.AccountAddressesPage })))
const AccountSecurityPage = lazy(() => import('./views/AccountSecurityPage').then(module => ({ default: module.AccountSecurityPage })))
const OrdersPage = lazy(() => import('./views/OrdersPage').then(module => ({ default: module.OrdersPage })))
const OrderDetailPage = lazy(() => import('./views/OrderDetailPage').then(module => ({ default: module.OrderDetailPage })))
const PrivacyPage = lazy(() => import('./views/PrivacyPage').then(module => ({ default: module.PrivacyPage })))
const TermsPage = lazy(() => import('./views/TermsPage').then(module => ({ default: module.TermsPage })))
const NotFoundPage = lazy(() => import('./views/NotFoundPage').then(module => ({ default: module.NotFoundPage })))

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
                      <Route path={ROUTE_PATHS.categories} element={<CategoriesPage />} />
                      <Route path={ROUTE_PATHS.category} element={<CategoryPage />} />
                      <Route path={ROUTE_PATHS.product} element={<ProductPage />} />
                      <Route path={ROUTE_PATHS.search} element={<SearchPage />} />
                      <Route path={ROUTE_PATHS.bestsellers} element={<BestsellersPage />} />
                      <Route path={ROUTE_PATHS.cart} element={<CartPage />} />
                      <Route path={ROUTE_PATHS.checkout} element={<CheckoutPage />} />
                      <Route path={ROUTE_PATHS.payment} element={<PaymentPage />} />
                      <Route path={ROUTE_PATHS.paymentResult} element={<PaymentPage returnMode />} />
                      <Route path={ROUTE_PATHS.paymentReturn} element={<PaymentReturnPage />} />
                      <Route path={ROUTE_PATHS.credit} element={<AccountCreditPage />} />
                      <Route path={ROUTE_PATHS.invoices} element={<AccountInvoicesPage />} />
                      <Route path={ROUTE_PATHS.invoice} element={<AccountInvoicesPage />} />
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
