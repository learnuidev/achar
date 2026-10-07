import type { Metadata } from 'next';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = {
  title: 'Sign in — Achar',
  description: 'Sign in to Achar, or create an account.',
};

export default function SignInPage() {
  return <SignInForm />;
}
