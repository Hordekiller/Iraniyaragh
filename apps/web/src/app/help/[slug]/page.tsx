import { notFound } from 'next/navigation'
import { HelpTopicPage } from '../../../views/HelpPage'
import { helpTopic } from '../../../lib/help-content'
import { metadataFor } from '../../../server/policy'
import { JsonLd, breadcrumb } from '../../../server/structured-data'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const topic = helpTopic(slug)
  if (!topic) notFound()
  return metadataFor({ title: `راهنما: ${topic.title}`, description: topic.summary, path: `/help/${slug}` })
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!helpTopic(slug)) notFound()
  const topic = helpTopic(slug)!
  return <><JsonLd data={breadcrumb([{ name: 'خانه', path: '/' }, { name: 'مرکز راهنمای مشتری', path: '/help' }, { name: topic.title, path: `/help/${slug}` }])} /><HelpTopicPage slug={slug} /></>
}
