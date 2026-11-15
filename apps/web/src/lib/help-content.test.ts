import { describe, expect, it } from 'vitest'
import { HELP_TOPIC_SLUGS } from '@iranyaragh/contracts'
import { HELP_TOPICS } from './help-content'

describe('public help route discovery', () => {
  it('has exactly one rendered help topic for every shared sitemap route', () => {
    expect(HELP_TOPICS.map(topic => topic.slug).sort()).toEqual([...HELP_TOPIC_SLUGS].sort())
  })
})
