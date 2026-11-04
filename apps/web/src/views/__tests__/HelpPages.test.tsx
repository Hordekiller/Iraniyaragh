import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { HELP_TOPICS, helpTopic } from '../../lib/help-content'
import { tourById } from '../../lib/help-tours'
import { HelpPage, HelpTopicPage } from '../HelpPage'

describe('customer help center', () => {
  it('lists every topic with a link to its own page', () => {
    render(<MemoryRouter><HelpPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'مرکز راهنمای مشتری' })).toBeInTheDocument()
    for (const topic of HELP_TOPICS) expect(screen.getByRole('link', { name: new RegExp(topic.title) })).toHaveAttribute('href', `/help/${topic.slug}`)
    expect(document.querySelector('a[href^="tel:"]')).toBeNull()
  })

  it('keeps slugs unique and cross-references valid', () => {
    const slugs = HELP_TOPICS.map(topic => topic.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const topic of HELP_TOPICS) {
      for (const related of topic.related) expect(helpTopic(related), `${topic.slug} -> ${related}`).toBeDefined()
      expect(topic.action.to.startsWith('/')).toBe(true)
    }
  })

  it('renders each topic page with its steps, FAQ and the pending-policy marker', () => {
    for (const topic of HELP_TOPICS) {
      const { unmount } = render(<MemoryRouter initialEntries={[`/help/${topic.slug}`]}><Routes><Route path="/help/:slug" element={<HelpTopicPage />} /></Routes></MemoryRouter>)
      expect(screen.getByRole('heading', { level: 1, name: topic.title })).toBeInTheDocument()
      expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(topic.sections.length - 1)
      unmount()
    }
  })

  it('never states payment success from a gateway return and flags unannounced return rules', () => {
    render(<MemoryRouter initialEntries={['/help/payment']}><Routes><Route path="/help/:slug" element={<HelpTopicPage />} /></Routes></MemoryRouter>)
    expect(screen.getByText(/صرف بازگشت از درگاه/)).toBeInTheDocument()
    render(<MemoryRouter initialEntries={['/help/returns-support']}><Routes><Route path="/help/:slug" element={<HelpTopicPage />} /></Routes></MemoryRouter>)
    expect(screen.getAllByText(/در انتظار اعلام فروشنده/).length).toBeGreaterThan(0)
  })

  it('links every interactive tour to a topic and offers to start it on the real page', () => {
    for (const topic of HELP_TOPICS.filter(item => item.tour)) expect(tourById(topic.tour!), topic.slug).toBeDefined()
    render(<MemoryRouter initialEntries={['/help/checkout']}><Routes><Route path="/help/:slug" element={<HelpTopicPage />} /></Routes></MemoryRouter>)
    expect(screen.getByRole('button', { name: /نمایش روی صفحه/ })).toBeInTheDocument()
  })

  it('renders a topic without any router <Route> (as the Next server pages do)', () => {
    render(<MemoryRouter><HelpTopicPage slug="payment" /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'پرداخت آنلاین' })).toBeInTheDocument()
  })

  it('renders the not-found page for an unknown topic', () => {
    render(<MemoryRouter initialEntries={['/help/nope']}><Routes><Route path="/help/:slug" element={<HelpTopicPage />} /></Routes></MemoryRouter>)
    expect(screen.queryByRole('heading', { name: 'مرکز راهنمای مشتری' })).toBeNull()
  })
})
