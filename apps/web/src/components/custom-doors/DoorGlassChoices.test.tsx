import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DoorMaterial } from '@iranyaragh/contracts'
import { DoorGlassChoices } from './DoorGlassChoices'

const glass: DoorMaterial = { id: 'glass', code: 'decofix-glass-clear-4mm', title: 'شیشه شفاف', category: 'GLASS', active: true, version: 1, variantId: null, configuration: { unit: 'M2', rate: '100000000', validUntil: null, specifications: '', color: 'شفاف', thicknessMm: 4, processingFee: '0', stockUnit: null, sampleKey: 'clear' } }
describe('glass color selection', () => {
  it('labels synthetic pictures and keeps the radio selection tied to the real material ID', () => {
    const change = vi.fn()
    const view = render(<DoorGlassChoices title="شیشه" materials={[glass]} selected="" onChange={change} unavailable={() => null} />)
    expect(screen.getByText(/عکس کالای واقعی نیستند/)).toBeInTheDocument()
    expect(view.container.querySelector('img')).toHaveAttribute('src', '/door-glass-samples/clear.webp')
    fireEvent.click(screen.getByRole('radio', { name: /شفاف/ }))
    expect(change).toHaveBeenCalledWith('glass')
  })
  it('honors incompatibility and prefers the approved library image over a synthetic sample', () => {
    const change=vi.fn()
    const view=render(<DoorGlassChoices title="شیشه" materials={[{...glass,imageUrl:'/media/glass.webp'}]} selected="glass" onChange={change} unavailable={() => 'نیازمند گزینه دیگر'} />)
    expect(view.container.querySelector('img')).toHaveAttribute('src','/media/glass.webp')
    expect(screen.getByRole('radio',{name:/شفاف/})).toBeDisabled()
    expect(screen.getByRole('radio',{name:/شفاف/})).toBeChecked()
    expect(screen.getByText(/تصویر ثبت‌شده فروشگاه/)).toBeInTheDocument()
  })
})
