import { useId } from 'react'
import { doorGlassSample, type DoorMaterial } from '@iranyaragh/contracts'

type Props = { title: string; materials: DoorMaterial[]; selected: string; onChange: (id: string) => void; unavailable: (id: string) => string | null | undefined }

export function DoorGlassChoices({ title, materials, selected, onChange, unavailable }: Props) {
  const name = useId()
  const glasses = materials.filter(material => material.category === 'GLASS')
  if (!glasses.length) return null
  return <fieldset className="mt-6 rounded-2xl border border-slate-200 p-4">
    <legend className="px-2 text-sm font-bold">نمایش رنگ‌ها — {title}</legend>
    <p className="mb-4 text-xs leading-6 text-slate-600">تصاویر با برچسب «آزمایشی» ساخته‌شده‌اند و عکس کالای واقعی نیستند. رنگ و موجودی نهایی پیش از ساخت تأیید می‌شود.</p>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {glasses.map(material => {
        const sample = doorGlassSample(material.code, material.configuration.sampleKey)
        const reason = unavailable(material.id)
        return <label key={material.id} className={`flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl border bg-white p-2 focus-within:ring-2 focus-within:ring-orange-700 ${selected === material.id ? 'border-orange-700 ring-1 ring-orange-700' : 'border-slate-200'} ${reason ? 'cursor-not-allowed opacity-60' : ''}`}>
          {material.imageUrl || sample ? <img src={material.imageUrl || `/door-glass-samples/${sample!.key}.webp`} alt="" width={240} height={240} loading="lazy" decoding="async" className="aspect-square w-full rounded-lg object-cover" /> : <div className="flex aspect-square items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-500">تصویر ثبت نشده</div>}
          <span className="mt-2 flex items-start gap-2 text-sm font-bold"><input type="radio" name={name} value={material.id} checked={selected === material.id} disabled={!!reason} onChange={() => onChange(material.id)} className="mt-1 shrink-0 accent-orange-700" />{material.configuration.color || material.title}</span>
          <span className="mt-1 text-xs text-slate-500">{material.configuration.thicknessMm ? `${material.configuration.thicknessMm} میلی‌متر · ` : ''}{material.imageUrl ? 'تصویر ثبت‌شده فروشگاه' : sample ? 'تصویر آزمایشی' : 'بدون تصویر'}{reason ? ` · ${reason}` : ''}</span>
        </label>
      })}
    </div>
  </fieldset>
}
