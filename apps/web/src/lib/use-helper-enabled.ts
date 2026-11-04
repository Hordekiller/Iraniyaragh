import { useEffect, useSyncExternalStore } from 'react'
import { jsonRequest } from './auth/request'
import { getHelperEnabled, getServerHelperEnabled, setHelperEnabled, subscribeEnabled } from './help-tour-state'

/** True only when the admin switch is on. Unknown or unreachable means hidden, never shown by guess. */
export function useHelperEnabled(): boolean {
  return useSyncExternalStore(subscribeEnabled, getHelperEnabled, getServerHelperEnabled) === true
}

/** Mounted once in the shell: reads the switch on load, when the tab becomes visible again and every minute. */
export function useHelperSwitchSync() {
  useEffect(() => {
    let alive = true
    const refresh = () => {
      void jsonRequest<{ enabled: boolean }>('/api/v1/catalog/storefront-helper')
        .then(response => { if (alive && typeof response.data.enabled === 'boolean') setHelperEnabled(response.data.enabled) })
        .catch(() => { /* keep the last known value; unknown stays hidden */ })
    }
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
}
