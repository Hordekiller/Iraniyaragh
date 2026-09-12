import { CartProvider } from "./context/CartContext";
import Header from "./components/Header";
import MobileBottomNav from "./components/MobileBottomNav";
import CartDrawer from "./components/CartDrawer";
import HeroSlider from "./components/HeroSlider";
import CategoriesSection from "./components/CategoriesSection";
import PopularToolsSection from "./components/PopularToolsSection";
import ServicesSection from "./components/ServicesSection";
import AboutSection from "./components/AboutSection";
import BlogSection from "./components/BlogSection";
import Footer from "./components/Footer";

function App() {
  return (
    <CartProvider>
      <div className="min-h-screen bg-[#0f1216] text-stone-100" dir="rtl">
        <Header />
        <main>
          <HeroSlider />
          <CategoriesSection />
          <PopularToolsSection />
          <ServicesSection />
          <AboutSection />
          <BlogSection />
        </main>
        <Footer />
        <MobileBottomNav />
        <CartDrawer />
      </div>
    </CartProvider>
  );
}

export default App;
