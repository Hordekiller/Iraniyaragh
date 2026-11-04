import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DoorImagePicker } from './DoorImagePicker';
vi.mock('@/lib/catalog/catalog-api', () => ({ listProducts: vi.fn(async () => ({items:[{id:'isolated-product',name:'کالای آزمایشی'}]})) }));
vi.mock('@/lib/catalog/media-api', () => ({ listProductMediaPicker: vi.fn(async () => [{id:'isolated-image',url:'/media/isolated.webp',alt:'تصویر آزمایشی',caption:null,width:800,height:600,originalWidth:1200,originalHeight:900}]) }));
vi.mock('@/lib/custom-doors/api', () => ({ doorAdminError: () => 'خواندن تصویر ناموفق بود' }));

describe('door image guidance', () => {
 it('shows recommended square sizing and original saved dimensions without conflating rendition pixels', () => {
  render(<DoorImagePicker label="تصویر شیشه" square value="saved" initialValue="saved" onChange={vi.fn()} imageUrl="/media/saved.webp" originalWidth={960} originalHeight={960}/>);
  expect(screen.getByText(/۴۸۰ × ۴۸۰/)).toBeInTheDocument();
  expect(screen.getByText(/ابعاد فایل اصلی انتخاب‌شده: 960 × 960 پیکسل/)).toBeInTheDocument();
  expect(screen.getByRole('img',{name:'پیش‌نمایش تصویر شیشه'})).toHaveAttribute('src','/media/saved.webp');
 });
 it('shows both original upload and processed preview dimensions after a library selection', async () => {
  function Editor(){const [id,setId]=useState<string|null>(null);return <DoorImagePicker label="تصویر شیشه" square value={id} onChange={setId}/>;}
  render(<Editor/>);
  fireEvent.click(screen.getByRole('button',{name:'جستجو در رسانه‌های موجود'}));
  fireEvent.mouseDown(screen.getByRole('combobox',{name:'کالای مرجع تصویر'}));
  fireEvent.click(await screen.findByRole('option',{name:'کالای آزمایشی'}));
  fireEvent.mouseDown(screen.getByRole('combobox',{name:'تصویر شیشه'}));
  fireEvent.click(await screen.findByRole('option',{name:/تصویر آزمایشی — فایل اصلی: 1200 × 900/}));
  expect(screen.getByText(/ابعاد فایل اصلی انتخاب‌شده: 1200 × 900 پیکسل/)).toBeInTheDocument();
  expect(screen.getByText(/ابعاد پیش‌نمایش پردازش‌شده: 800 × 600 پیکسل/)).toBeInTheDocument();
 });
});
