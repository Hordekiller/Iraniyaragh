import { createContext, useContext } from 'react'

/** Whether at least one article is live; the blog link is hidden until then (no link to a 404). */
export const BlogNavContext = createContext(false)
export const useHasBlog = () => useContext(BlogNavContext)
