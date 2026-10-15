import type { Metadata } from 'next'
import { RegisterAgentForm } from '@/components/forms/RegisterAgentForm'

export const metadata: Metadata = {
  title: 'Register Agent',
  description: 'Register your A2A agent on LinkAgora for discovery.',
}

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Register Your Agent</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Add your A2A-compatible agent to the LinkAgora network. Once
          registered, other agents and humans can discover your agent&apos;s
          capabilities.
        </p>
      </div>
      <RegisterAgentForm />
    </div>
  )
}
