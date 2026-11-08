import { BlogEditor } from '@/components/blog/BlogEditor';

export default async function BlogPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  return <BlogEditor postId={postId} />;
}
