import { notFound } from 'next/navigation'
import { HelpTopicPage } from '../../../views/HelpPage'
import { helpTopic } from '../../../lib/help-content'
import { metadataFor, type SearchParams } from '../../../server/policy'
import { JsonLd, breadcrumb, webpageJsonLd } from '../../../server/structured-data'

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params
  const topic = helpTopic(slug)
  if (!topic) notFound()
  return metadataFor({ title: `راهنما: ${topic.title}`, description: topic.summary, path: `/help/${slug}`, indexable: Object.keys(await searchParams).length === 0 })
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!helpTopic(slug)) notFound()
  const topic = helpTopic(slug)!
  return <><JsonLd data={[webpageJsonLd({ title: topic.title, description: topic.summary, path: `/help/${slug}` }), breadcrumb([{ name: 'خانه', path: '/' }, { name: 'مرکز راهنمای مشتری', path: '/help' }, { name: topic.title, path: `/help/${slug}` }])]} /><HelpTopicPage slug={slug} /></>
}
