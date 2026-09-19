import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { OrderProvider } from './OrderProvider'
import { useOrderApi } from './order-context'
import { commerceStub } from '../test/commerce'

it('provides an explicit commerce API override for isolated order surfaces', () => {
  const api = commerceStub()
  function Probe() {
    return <span>{useOrderApi() === api ? 'ready' : 'wrong'}</span>
  }
  render(
    <OrderProvider api={api}>
      <Probe />
    </OrderProvider>,
  )
  expect(screen.getByText('ready')).toBeInTheDocument()
})
