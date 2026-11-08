'use client'
import type { ReactNode } from 'react'
import { BlogNavContext } from './blog-nav-context'

export function BlogNavProvider({ hasBlog, children }: { hasBlog: boolean; children: ReactNode }) {
  return <BlogNavContext.Provider value={hasBlog}>{children}</BlogNavContext.Provider>
}
