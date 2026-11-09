import { useEffect, useState } from 'react'
import { jsonRequest } from './auth/request'

/**
 * True only when the administrator has switched returns on. While loading, when
 * the request fails or the answer is anything but `true`, the store does not
 * advertise a return policy: unknown never means "published".
 */
export function useReturnsEnabled(): boolean {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let alive = true
    void jsonRequest<{ enabled: boolean }>('/api/v1/returns/public/config')
      .then(response => { if (alive) setEnabled(response.data.enabled === true) })
      .catch(() => { if (alive) setEnabled(false) })
    return () => { alive = false }
  }, [])
  return enabled
}
