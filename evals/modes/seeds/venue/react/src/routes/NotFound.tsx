import { Gone } from './Status'
import { usePageTitle } from './usePageTitle'

export function NotFound() {
  usePageTitle('Not found')
  return <Gone title="There’s nothing here">That page doesn’t exist.</Gone>
}
