import { createFileRoute } from '@tanstack/react-router'

import { LoginFailedError } from '@/features/errors/login-failed'

export const Route = createFileRoute('/(errors)/login-failed')({
  component: LoginFailedError,
})
