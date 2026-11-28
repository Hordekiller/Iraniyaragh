import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogProduct, CatalogSuggestions } from '../../services/catalog/types'
import { SmartSearch, SearchHighlight } from './SmartSearch'
const mock = vi.hoisted(() => ({ suggest: vi.fn() }))
vi.mock('../../state/catalog-context', () => ({ useCatalogApi: () => mock }))
const product: CatalogProduct = { id: 'fixture-hinge', slug: 'fixture-hinge', name: 'لولا گازور', brand: null, category: null, image: '/fixture.png', media: [], variants: [], description: null, price: {amount:'10000',currency:'IRR'},oldPrice:null,rating:null,reviews:0,stockStatus:'IN_STOCK',badge:null }
const result = (name = product.name): CatalogSuggestions => ({items:[{...product,name}],meta:{page:1,perPage:8,total:1,pages:1},facets:{categories:[],brands:[]},correctedQuery:null})
function Harness() { const [value,setValue]=useState(''); return <SmartSearch value={value} onChange={setValue} /> }
function mount() { render(<MemoryRouter initialEntries={['/search?available=1']}><Routes><Route path="/search" element={<Harness/>}/><Route path="/products/:slug" element={<h1>صفحهٔ کالا</h1>}/></Routes></MemoryRouter>); const input=screen.getByRole('combobox'); fireEvent.focus(input);return input }
async function tick() { await act(async()=>{await vi.advanceTimersByTimeAsync(120)}) }
beforeEach(()=>{vi.useFakeTimers();mock.suggest.mockReset();mock.suggest.mockResolvedValue(result());localStorage.clear()})
afterEach(()=>vi.useRealTimers())
describe('SmartSearch',()=>{
 it('starts at two meaningful characters, debounces and bounds to server suggestions',async()=>{
  const input=mount();fireEvent.change(input,{target:{value:'ل'}});await tick();expect(mock.suggest).not.toHaveBeenCalled();
  fireEvent.change(input,{target:{value:'لو'}});expect(mock.suggest).not.toHaveBeenCalled();await tick();expect(mock.suggest).toHaveBeenCalledWith('لو',expect.any(AbortSignal));expect(screen.getByRole('option')).toHaveTextContent('لولا گازور');
 });
 it('aborts old requests and never lets a late result replace a new query',async()=>{
  let resolveOld!:(data:CatalogSuggestions)=>void;
  mock.suggest.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve}));
  const input=mount();fireEvent.change(input,{target:{value:'لو'}});await tick();const oldSignal=mock.suggest.mock.calls[0][1] as AbortSignal;
  fireEvent.change(input,{target:{value:'ریل'}});await tick();expect(oldSignal.aborted).toBe(true);
  await act(async()=>resolveOld(result('نتیجه قدیمی')));expect(screen.queryByText('نتیجه قدیمی')).not.toBeInTheDocument();expect(mock.suggest.mock.calls.at(-1)?.[0]).toBe('ریل');
 });
 it('waits for IME composition before searching',async()=>{const input=mount();fireEvent.compositionStart(input);fireEvent.change(input,{target:{value:'لولا'}});await tick();expect(mock.suggest).not.toHaveBeenCalled();fireEvent.compositionEnd(input);await tick();expect(mock.suggest).toHaveBeenCalledOnce()});
 it('supports keyboard selection and direct product navigation',async()=>{const input=mount();fireEvent.change(input,{target:{value:'لو'}});await tick();fireEvent.keyDown(input,{key:'ArrowDown'});expect(input).toHaveAttribute('aria-activedescendant');fireEvent.keyDown(input,{key:'Enter'});expect(screen.getByRole('heading',{name:'صفحهٔ کالا'})).toBeInTheDocument()});
 it('closes with Escape without submitting',async()=>{const input=mount();fireEvent.change(input,{target:{value:'لو'}});await tick();fireEvent.keyDown(input,{key:'Escape'});expect(input).toHaveAttribute('aria-expanded','false');expect(screen.queryByRole('option')).not.toBeInTheDocument()});
 it('keeps errors explicit and retries',async()=>{mock.suggest.mockRejectedValueOnce(new Error('offline'));const input=mount();fireEvent.change(input,{target:{value:'لو'}});await tick();expect(screen.getByRole('button',{name:'تلاش دوباره'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'تلاش دوباره'}));await tick();expect(screen.getByRole('option')).toBeInTheDocument()});
 it('preserves filters in view-all navigation',async()=>{const input=mount();fireEvent.change(input,{target:{value:'لو'}});await tick();expect(screen.getByRole('link',{name:'همهٔ نتایج «لو»'})).toHaveAttribute('href','/search?available=1&q=%D9%84%D9%88')});
 it('clears local recent history',()=>{localStorage.setItem('irani-search-history-v1',JSON.stringify(['لولا']));mount();expect(screen.getByRole('button',{name:'لولا'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'پاک کردن سابقه'}));expect(localStorage.getItem('irani-search-history-v1')).toBeNull()});
 it('highlights text without interpreting HTML',()=>{const {container}=render(<SearchHighlight text={'<img src=x onerror=alert(1)> لولا'} query="لولا"/>);expect(container.querySelector('img')).toBeNull();expect(container.querySelector('mark')).toHaveTextContent('لولا')});
})
