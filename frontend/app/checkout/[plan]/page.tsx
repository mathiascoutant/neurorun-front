import { CheckoutPlanClient } from './CheckoutPlanClient'

/** Requis par `output: 'export'` : pré-génère `/checkout/strava/` et `/checkout/performance/`. */
export function generateStaticParams() {
  return [{ plan: 'strava' }, { plan: 'performance' }]
}

export default function CheckoutPlanPage() {
  return <CheckoutPlanClient />
}
