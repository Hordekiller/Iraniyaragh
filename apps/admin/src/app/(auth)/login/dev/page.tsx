import { notFound } from 'next/navigation';
import { DevLoginForm } from './DevLoginForm';

export default function DevLoginPage() {
  // Match the API's explicit feature gate. The value stays server-only and is
  // never serialized; production/staging reject AUTH_DEV_CODE during startup.
  if (!process.env.AUTH_DEV_CODE) {
    notFound();
  }

  return <DevLoginForm />;
}
