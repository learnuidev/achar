import type { Metadata } from 'next';
import { SignUpForm } from './sign-up-form';

export const metadata: Metadata = {
  title: 'Create an account — Achar',
  description: 'Create an Achar account and confirm your email address.',
};

export default function SignUpPage() {
  return <SignUpForm />;
}
