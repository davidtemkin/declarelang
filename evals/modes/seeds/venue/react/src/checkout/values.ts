import type { Country } from '../api'

export const NEW_CARD = 'new'

export type CheckoutValues = {
  /** A saved card's id, or NEW_CARD. */
  method: string
  savedCvc: string
  email: string
  name: string
  number: string
  expiry: string
  cvc: string
  line1: string
  line2: string
  city: string
  postalCode: string
  country: Country
}

export const COUNTRIES: { code: Country; name: string }[] = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
]

/** A sensible first guess at the billing country, from the browser's language. */
export function guessCountry(): Country {
  const region = navigator.language.split('-')[1]?.toUpperCase()
  return region === 'GB' || region === 'CA' ? region : 'US'
}

export function emptyValues(): CheckoutValues {
  return {
    method: NEW_CARD,
    savedCvc: '',
    email: '',
    name: '',
    number: '',
    expiry: '',
    cvc: '',
    line1: '',
    line2: '',
    city: '',
    postalCode: '',
    country: guessCountry(),
  }
}

/** Kept between visits to checkout — without either security code. */
export function draftOf(values: CheckoutValues): Partial<CheckoutValues> {
  const draft: Partial<CheckoutValues> = { ...values }
  delete draft.savedCvc
  delete draft.cvc
  return draft
}
