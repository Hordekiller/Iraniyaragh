import { services } from "../data/services";

export default function ServicesSection() {
  return (
    <section id="services" className="py-20 lg:py-28 bg-[#0f1216]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-amber-500 font-bold text-sm tracking-wide">خدمات ما</span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white mt-2">
            تجربه‌ی خریدی متفاوت و آسان
          </h2>
          <p className="text-stone-400 mt-4 leading-7">
            از انتخاب تا تحویل، در هر مرحله همراه شما هستیم تا بهترین تجربه خرید ابزار را داشته باشید
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <div
                key={service.id}
                className="group bg-[#181b20] border border-white/10 rounded-2xl p-6 lg:p-7 hover:border-amber-500/40 hover:-translate-y-1 transition-all duration-300"
              >
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-5 group-hover:bg-amber-500 transition-colors">
                  <Icon className="w-6 h-6 text-amber-400 group-hover:text-[#0f1216] transition-colors" strokeWidth={2} />
                </div>
                <h3 className="text-stone-100 font-bold text-lg mb-2">{service.title}</h3>
                <p className="text-stone-400 text-sm leading-7">{service.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
