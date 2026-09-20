import { notFound } from 'next/navigation';
import { DevLoginForm } from './DevLoginForm';

export default function DevLoginPage() {
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    notFound();
  }

  return <DevLoginForm />;
}
