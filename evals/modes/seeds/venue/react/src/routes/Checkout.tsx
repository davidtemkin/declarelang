import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useForm, type FieldPath } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { api, ApiError, type Account, type OrderRequest, type SavedCard } from '../api'
import { useBooking } from '../booking'
import {
  cardInfo,
  digitsOnly,
  formatCardNumber,
  formatExpiry,
  isExpired,
  normalisePostalCode,
  parseExpiry,
  validateCardNumber,
  validateCvc,
  validateCvcLength,
  validateExpiry,
  validatePostalCode,
} from '../checkout/card'
import { SelectField, TextField } from '../checkout/Field'
import { COUNTRIES, NEW_CARD, draftOf, emptyValues, type CheckoutValues } from '../checkout/values'
import { BRAND_NAMES, formatDate, formatMoney, formatTime, seatCount } from '../format'
import { useLiveSeats, type SeatInfo } from '../hall/LiveSeats'
import { keys, useAccount, useProduction } from '../queries'
import { useAnnounce } from '../shell/Announcer'
import { useOpenSignIn } from '../shell/SignIn'
import { usePageTitle } from './usePageTitle'
import styles from './Checkout.module.css'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function Checkout() {
  const { performance, seats, refetch } = useLiveSeats()
  const booking = useBooking()
  const production = useProduction()
  const account = useAccount()
  const user = account.data ?? null
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const openSignIn = useOpenSignIn()
  const announce = useAnnounce()
  const headingRef = usePageTitle<HTMLHeadingElement>('Checkout')

  const form = useForm<CheckoutValues>({
    // Judge a field once the person has left it, then keep up as they fix it.
    mode: 'onTouched',
    defaultValues: { ...emptyValues(), ...booking.draft },
  })
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    setError,
    setFocus,
    watch,
    trigger,
    formState,
  } = form
  const { errors, touchedFields } = formState

  // Keep what was typed if the person goes back to the hall (never the security codes).
  const { saveDraft } = booking
  useEffect(() => () => saveDraft(draftOf(getValues())), [saveDraft, getValues])

  // Signing in (or arriving signed in) fills in what the account knows, without
  // overwriting anything already typed. Signing out takes away the saved cards.
  useEffect(() => {
    if (account.isPending) return
    const v = getValues()
    if (!user) {
      if (v.method !== NEW_CARD) setValue('method', NEW_CARD)
      return
    }
    if (!v.email) setValue('email', user.email)
    if (!v.name) setValue('name', user.name)
    if (user.billing && !v.line1 && !v.city && !v.postalCode) {
      setValue('line1', user.billing.line1)
      setValue('line2', user.billing.line2 ?? '')
      setValue('city', user.billing.city)
      setValue('postalCode', user.billing.postalCode)
      setValue('country', user.billing.country)
    }
    const usable = user.cards.find((c) => !isExpired(c.expMonth, c.expYear))
    const chosen = user.cards.find((c) => c.id === v.method)
    if (chosen && isExpired(chosen.expMonth, chosen.expYear)) setValue('method', NEW_CARD)
    if (usable && v.method === NEW_CARD && !digitsOnly(v.number)) setValue('method', usable.id)
  }, [user, account.isPending, getValues, setValue])

  const method = watch('method')
  const number = watch('number')
  const country = watch('country')
  const savedCard = user?.cards.find((c) => c.id === method) ?? null
  const card = cardInfo(number)

  const chosen = booking.selected.map((id) => seats.get(id)).filter((s): s is SeatInfo => !!s)
  const totalCents = chosen.reduce((n, s) => n + s.priceCents + s.feeCents, 0)

  const [paying, setPaying] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const bannerRef = useRef<HTMLParagraphElement>(null)

  // At a desk the order and the pay button both stay in view; the button sits below the order.
  const summaryRef = useRef<HTMLElement>(null)
  const hasSummary = chosen.length > 0
  useEffect(() => {
    const el = summaryRef.current
    if (!el) return
    const observer = new ResizeObserver(() =>
      el.parentElement?.style.setProperty('--summary-height', `${el.offsetHeight}px`),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasSummary])

  const { setPaying: setBookingPaying, complete, lose } = booking

  async function pay(values: CheckoutValues) {
    setPaying(true)
    setBookingPaying(true)
    setServerError(null)
    announce('Payment under way.')
    try {
      const order = await api.placeOrder(buildOrder(performance.id, booking.selected, values, user))
      complete(order)
      navigate('/tickets')
    } catch (err) {
      handleRefusal(err, values)
    } finally {
      inFlight.current = false
      setPaying(false)
      setBookingPaying(false)
    }
  }

  function handleRefusal(err: unknown, values: CheckoutValues) {
    const usingSaved = values.method !== NEW_CARD
    const cvcField = usingSaved ? 'savedCvc' : 'cvc'
    if (!(err instanceof ApiError)) {
      showBanner('Something went wrong and nothing was charged. Please try again.')
      return
    }
    const { status, body } = err
    if (status === 402) {
      // Declined: keep everything but the security code, ready to try again.
      setValue(cvcField, '', { shouldValidate: false })
      showBanner(body.message, cvcField)
      return
    }
    if (status === 422 && body.field) {
      const field: FieldPath<CheckoutValues> =
        body.field === 'cvc' ? cvcField : body.field === 'number' ? 'number' : body.field
      if (usingSaved && field !== cvcField) {
        showBanner(body.message)
        return
      }
      setError(field, { type: 'server', message: body.message }, { shouldFocus: true })
      return
    }
    if (status === 409) {
      // Nothing was charged. Back to the hall without the seat that went.
      lose(body.conflicts ?? [], body.message)
      refetch()
      navigate('..')
      return
    }
    if (status === 401) {
      queryClient.setQueryData<Account | null>(keys.me, null)
      showBanner(body.message)
      return
    }
    showBanner(body.message)
  }

  function showBanner(message: string, focusField?: FieldPath<CheckoutValues>) {
    setServerError(message)
    requestAnimationFrame(() => {
      if (focusField) setFocus(focusField)
      else bannerRef.current?.focus()
    })
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // One payment, however many presses, taps or Enters.
    if (inFlight.current) return
    inFlight.current = true
    setServerError(null)
    void handleSubmit(pay, () => {
      inFlight.current = false
    })(event)
  }

  // Formatting as typed keeps the caret where the person is typing.
  function reformat(
    event: ChangeEvent<HTMLInputElement>,
    format: (v: string, deleting: boolean) => string,
  ) {
    const input = event.target
    const deleting = (event.nativeEvent as InputEvent).inputType?.startsWith('delete') ?? false
    const caret = input.selectionStart ?? input.value.length
    const atEnd = caret === input.value.length
    const digitsBefore = digitsOnly(input.value.slice(0, caret)).length
    const next = format(input.value, deleting)
    if (next === input.value) return
    input.value = next
    if (document.activeElement !== input) return
    if (atEnd) {
      input.setSelectionRange(next.length, next.length)
      return
    }
    let pos = 0
    for (let seen = 0; pos < next.length && seen < digitsBefore; pos++)
      if (/\d/.test(next[pos])) seen++
    if (!deleting) while (pos < next.length && /\D/.test(next[pos])) pos++
    input.setSelectionRange(pos, pos)
  }

  const numberField = register('number', {
    validate: (v, all) => all.method !== NEW_CARD || validateCardNumber(v),
  })
  const expiryField = register('expiry', {
    validate: (v, all) => all.method !== NEW_CARD || validateExpiry(v),
  })
  const countryField = register('country')
  const brandId = 'card-brand'

  if (!chosen.length) {
    return (
      <div className={styles.empty}>
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          You haven’t any seats chosen
        </h1>
        {booking.notice && <p role="status">{booking.notice.text}</p>}
        <Link to=".." className="button button-primary">
          Choose seats
        </Link>
      </div>
    )
  }

  const newCard = method === NEW_CARD
  const required = (message: string) => (v: string, all: CheckoutValues) =>
    all.method !== NEW_CARD || v.trim() !== '' || message

  return (
    <div className={styles.page}>
      <Link to=".." className={styles.back}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="m10 3-5 5 5 5" />
        </svg>
        Change seats
      </Link>

      <form
        className={styles.layout}
        onSubmit={onSubmit}
        noValidate
        aria-labelledby="checkout-title"
      >
        <section ref={summaryRef} className={styles.summary} aria-labelledby="order-title">
          <h2 id="order-title" className={styles.summaryTitle}>
            <span className={styles.production}>{production.data?.title}</span>
            <span>
              {formatDate(performance.startsAt)} · {formatTime(performance.startsAt)}
            </span>
          </h2>
          <div role="status">
            {booking.notice && <p className={styles.notice}>{booking.notice.text}</p>}
          </div>
          <table className={styles.lines}>
            <caption className="visually-hidden">
              {seatCount(chosen.length)}, each with its price and booking fee
            </caption>
            <thead className="visually-hidden">
              <tr>
                <th scope="col">Seat</th>
                <th scope="col">Price</th>
                <th scope="col">Booking fee</th>
              </tr>
            </thead>
            <tbody>
              {chosen.map((s) => (
                <tr key={s.id}>
                  <th scope="row">
                    <span className={styles.lineSection}>{s.sectionName}</span>
                    Row {s.row}, seat {s.number}
                  </th>
                  <td className="amount">{formatMoney(s.priceCents)}</td>
                  <td className={`amount ${styles.fee}`}>
                    + {formatMoney(s.feeCents)}
                    <span className={styles.feeLabel}> fee</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className={styles.totals}>
            <div>
              <dt>Seats</dt>
              <dd className="amount">
                {formatMoney(chosen.reduce((n, s) => n + s.priceCents, 0))}
              </dd>
            </div>
            <div>
              <dt>Booking fees</dt>
              <dd className="amount">{formatMoney(chosen.reduce((n, s) => n + s.feeCents, 0))}</dd>
            </div>
            <div className={styles.grand}>
              <dt>Total</dt>
              <dd className="amount">{formatMoney(totalCents)}</dd>
            </div>
          </dl>
        </section>

        <div className={styles.fields}>
          <h1 id="checkout-title" ref={headingRef} tabIndex={-1} className={styles.title}>
            Checkout
          </h1>
          <p className={styles.lede}>
            Your tickets are sent by email and shown on your phone at the door.
          </p>

          {!user && !account.isPending && (
            <p className={styles.signInPrompt}>
              Booked with us before?{' '}
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  openSignIn({ onSignedIn: () => document.getElementById('pay-with')?.focus() })
                }
              >
                Use your account
              </button>{' '}
              for your saved cards and address.
            </p>
          )}

          {user && user.cards.length > 0 && (
            <fieldset className={styles.group}>
              <legend id="pay-with" tabIndex={-1} className={styles.groupTitle}>
                Pay with
              </legend>
              <div className={styles.methods}>
                {user.cards.map((c) => (
                  <SavedCardOption
                    key={c.id}
                    card={c}
                    register={register}
                    selected={method === c.id}
                  >
                    {method === c.id && (
                      <div className={styles.savedDetails}>
                        <TextField
                          label="Security code"
                          hint={`The ${savedCvcLength(c)} digits ${c.brand === 'amex' ? 'on the front' : 'on the back'} of your card`}
                          error={errors.savedCvc?.message}
                          inputMode="numeric"
                          autoComplete="cc-csc"
                          maxLength={savedCvcLength(c)}
                          enterKeyHint="go"
                          className={styles.cvcField}
                          {...register('savedCvc', {
                            validate: (v, all) =>
                              all.method !== c.id || validateCvcLength(v, savedCvcLength(c)),
                          })}
                        />
                        <p className={styles.sentTo}>
                          Tickets go to <strong>{user.email}</strong>
                          {user.billing && (
                            <>
                              {' '}
                              · billing address {user.billing.line1}, {user.billing.city}{' '}
                              {user.billing.postalCode}
                            </>
                          )}
                        </p>
                      </div>
                    )}
                  </SavedCardOption>
                ))}
                <label className={styles.method} data-selected={newCard || undefined}>
                  <input type="radio" value={NEW_CARD} {...register('method')} />
                  <span className={styles.methodName}>A new card</span>
                </label>
              </div>
            </fieldset>
          )}

          {newCard && (
            <>
              <fieldset className={styles.group}>
                <legend className={styles.groupTitle}>Where to send your tickets</legend>
                <TextField
                  label="Email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="next"
                  error={errors.email?.message}
                  {...register('email', {
                    validate: (v, all) =>
                      all.method !== NEW_CARD ||
                      (!v.trim()
                        ? 'Enter your email address.'
                        : EMAIL.test(v.trim()) || 'Enter an email address like name@example.com.'),
                  })}
                />
              </fieldset>

              <fieldset className={styles.group}>
                <legend className={styles.groupTitle}>Card</legend>
                <TextField
                  label="Name on card"
                  autoComplete="cc-name"
                  autoCapitalize="words"
                  spellCheck={false}
                  enterKeyHint="next"
                  error={errors.name?.message}
                  {...register('name', {
                    validate: required('Enter the name as it’s printed on the card.'),
                  })}
                />
                <TextField
                  label="Card number"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  placeholder="1234 1234 1234 1234"
                  describedBy={brandId}
                  error={errors.number?.message}
                  adornment={<CardBrandBadge id={brandId} brand={card.brand} />}
                  {...numberField}
                  onChange={(e) => {
                    reformat(e, formatCardNumber)
                    void numberField.onChange(e)
                    if (touchedFields.cvc) void trigger('cvc')
                  }}
                />
                <div className={styles.pair}>
                  <TextField
                    label="Expiry"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    autoCorrect="off"
                    enterKeyHint="next"
                    placeholder="MM / YY"
                    maxLength={7}
                    error={errors.expiry?.message}
                    {...expiryField}
                    onChange={(e) => {
                      reformat(e, formatExpiry)
                      void expiryField.onChange(e)
                    }}
                  />
                  <TextField
                    label="Security code"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    autoCorrect="off"
                    enterKeyHint="next"
                    placeholder={card.cvcLength === 4 ? '4 digits' : '3 digits'}
                    maxLength={card.cvcLength}
                    hint={
                      card.brand === 'amex' ? 'On the front of the card' : 'On the back of the card'
                    }
                    error={errors.cvc?.message}
                    {...register('cvc', {
                      validate: (v, all) => all.method !== NEW_CARD || validateCvc(v, all.number),
                    })}
                  />
                </div>
              </fieldset>

              <fieldset className={styles.group}>
                <legend className={styles.groupTitle}>Billing address</legend>
                <TextField
                  label="Street address"
                  autoComplete="billing address-line1"
                  enterKeyHint="next"
                  error={errors.line1?.message}
                  {...register('line1', { validate: required('Enter the street address.') })}
                />
                <TextField
                  label="Address line 2"
                  optional
                  autoComplete="billing address-line2"
                  enterKeyHint="next"
                  {...register('line2')}
                />
                <TextField
                  label="City"
                  autoComplete="billing address-level2"
                  enterKeyHint="next"
                  error={errors.city?.message}
                  {...register('city', { validate: required('Enter the city.') })}
                />
                <div className={styles.pair}>
                  <SelectField
                    label="Country"
                    autoComplete="billing country"
                    {...countryField}
                    onChange={(e) => {
                      void countryField.onChange(e)
                      if (touchedFields.postalCode || errors.postalCode) void trigger('postalCode')
                    }}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </SelectField>
                  <TextField
                    label="Postal code"
                    autoComplete="billing postal-code"
                    inputMode={country === 'US' ? 'numeric' : 'text'}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="done"
                    error={errors.postalCode?.message}
                    {...register('postalCode', {
                      validate: (v, all) =>
                        all.method !== NEW_CARD || validatePostalCode(v, all.country),
                    })}
                  />
                </div>
              </fieldset>
            </>
          )}
        </div>

        <div className={styles.payBar}>
          <p
            ref={bannerRef}
            tabIndex={-1}
            className={styles.refusal}
            role="alert"
            data-visible={serverError ? true : undefined}
          >
            {serverError}
          </p>
          <div className={styles.payRow}>
            <div className={styles.payTotal}>
              <span className={styles.payTotalLabel}>Total</span>
              <span className="amount">{formatMoney(totalCents)}</span>
            </div>
            <button
              type="submit"
              className={`button button-primary ${styles.pay}`}
              aria-disabled={paying || undefined}
              aria-describedby="pay-status"
            >
              {paying ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Paying…
                </>
              ) : (
                <>Pay {formatMoney(totalCents)}</>
              )}
            </button>
          </div>
          <p id="pay-status" className={styles.reassure}>
            {paying ? (
              'Payment under way — please keep this page open.'
            ) : (
              <>
                <LockIcon />{' '}
                {savedCard
                  ? `${BRAND_NAMES[savedCard.brand]} ending ${savedCard.last4}`
                  : 'Card details go only to The Venue’s payment service'}
              </>
            )}
          </p>
        </div>
      </form>
    </div>
  )
}

function savedCvcLength(card: SavedCard) {
  return card.brand === 'amex' ? 4 : 3
}

function SavedCardOption({
  card,
  register,
  selected,
  children,
}: {
  card: SavedCard
  register: ReturnType<typeof useForm<CheckoutValues>>['register']
  selected: boolean
  children?: React.ReactNode
}) {
  const expired = isExpired(card.expMonth, card.expYear)
  const expiry = `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}`
  return (
    <div
      className={styles.methodBlock}
      data-selected={selected || undefined}
      data-expired={expired || undefined}
    >
      <label className={styles.method}>
        <input type="radio" value={card.id} disabled={expired} {...register('method')} />
        <CardBrandMark brand={card.brand} />
        <span className={styles.methodName}>
          {BRAND_NAMES[card.brand]} ending {card.last4}
        </span>
        <span className={styles.methodExpiry}>
          {expired ? `Expired ${expiry}` : `Expires ${expiry}`}
        </span>
      </label>
      {children}
    </div>
  )
}

function CardBrandBadge({ id, brand }: { id: string; brand: SavedCard['brand'] | null }) {
  return (
    <span id={id} aria-live="polite" className={styles.brandBadge}>
      {brand && (
        <>
          <span className="visually-hidden">Card type: </span>
          <CardBrandMark brand={brand} />
          <span className="visually-hidden">{BRAND_NAMES[brand]}</span>
        </>
      )}
    </span>
  )
}

/** A small typographic mark for each brand, as people recognise them on the card. */
function CardBrandMark({ brand }: { brand: SavedCard['brand'] }) {
  return (
    <span className={styles.brandMark} data-brand={brand} aria-hidden="true">
      {brand === 'visa' && 'VISA'}
      {brand === 'mastercard' && (
        <svg viewBox="0 0 24 16">
          <circle cx="9" cy="8" r="6" fill="#eb001b" />
          <circle cx="15" cy="8" r="6" fill="#f79e1b" fillOpacity="0.9" />
        </svg>
      )}
      {brand === 'amex' && 'AMEX'}
      {brand === 'discover' && 'DISCOVER'}
    </span>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={styles.lock}>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  )
}

function buildOrder(
  performanceId: string,
  seatIds: string[],
  v: CheckoutValues,
  user: Account | null,
): OrderRequest {
  if (v.method !== NEW_CARD && user) {
    return {
      performanceId,
      seatIds,
      email: user.email,
      payment: { savedCardId: v.method, cvc: v.savedCvc },
    }
  }
  const expiry = parseExpiry(v.expiry)!
  return {
    performanceId,
    seatIds,
    email: v.email.trim(),
    payment: {
      card: {
        number: digitsOnly(v.number),
        expMonth: expiry.month,
        expYear: expiry.year,
        cvc: v.cvc,
        name: v.name.trim(),
      },
      billing: {
        line1: v.line1.trim(),
        line2: v.line2.trim() || null,
        city: v.city.trim(),
        postalCode: normalisePostalCode(v.postalCode, v.country),
        country: v.country,
      },
    },
  }
}
