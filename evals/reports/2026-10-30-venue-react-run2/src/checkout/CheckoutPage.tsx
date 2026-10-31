import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSignInDialog } from "../account/SignInProvider";
import { api, ApiError } from "../api/client";
import { markSeatsSold, queryKeys, useAccount } from "../api/queries";
import type { Account, Country, NewOrder } from "../api/types";
import { formatDate, formatMoney, formatTime, plural } from "../format";
import { chosenSeats } from "../hall/seats";
import { usePerformance } from "../performances/PerformanceRoute";
import { useSelection } from "../selection";
import { Notices } from "../ui/Notices";
import { BackLink, SiteHeader } from "../ui/SiteHeader";
import { useFocusOnArrival } from "../ui/useFocusOnArrival";
import {
  BRAND_NAMES,
  COUNTRIES,
  cardKind,
  checkCardNumber,
  checkEmail,
  checkExpiry,
  checkPostalCode,
  checkSecurityCode,
  digitsOf,
  formatCardExpiry,
  formatCardNumber,
  formatExpiry,
  normalizePostalCode,
  parseExpiry,
  postalIsNumeric,
  savedCardExpired,
} from "./card";
import { CardBadge } from "./CardBadge";
import { SelectField, TextField } from "./Field";
import { useKeepFocusedFieldInView } from "./useKeepFocusedFieldInView";
import styles from "./Checkout.module.css";

type CheckoutValues = {
  /** A saved card's id, or "new". */
  method: string;
  savedCvc: string;
  email: string;
  name: string;
  number: string;
  expiry: string;
  cvc: string;
  country: Country;
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
};

const EMPTY: CheckoutValues = {
  method: "new",
  savedCvc: "",
  email: "",
  name: "",
  number: "",
  expiry: "",
  cvc: "",
  country: "US",
  line1: "",
  line2: "",
  city: "",
  postalCode: "",
};

/** Where each of the service's field names is typed. */
const SERVICE_FIELDS: Record<string, keyof CheckoutValues> = {
  cvc: "cvc",
  postalCode: "postalCode",
  number: "number",
  expiry: "expiry",
  email: "email",
};

export function CheckoutPage() {
  const { performanceId = "" } = useParams();
  const { production, performance, seatMap } = usePerformance();
  const { seatIdsFor, loseSeats, setPaying, completeOrder, checkoutDraft, order: completedOrder } = useSelection();
  const account = useAccount();
  const me = account.data;
  const { openSignIn } = useSignInDialog();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const heading = useFocusOnArrival<HTMLHeadingElement>();
  useKeepFocusedFieldInView();

  const seatIds = seatIdsFor(performanceId);
  const chosen = useMemo(() => chosenSeats(seatMap, seatIds), [seatMap, seatIds]);
  const totalCents = chosen.reduce((sum, { section }) => sum + section.priceCents + section.feeCents, 0);
  const pay = `Pay ${formatMoney(totalCents)}`;

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    getValues,
    setValue,
    setError,
    resetField,
    trigger,
    getFieldState,
  } = useForm<CheckoutValues>({
    // A field is judged once the person has left it, never while first typing in it.
    mode: "onTouched",
    defaultValues: { ...EMPTY, ...(checkoutDraft.current as Partial<CheckoutValues> | null) },
  });

  const method = watch("method");
  const country = watch("country");
  const kind = cardKind(watch("number"));
  const codeSize = kind?.codeSize ?? 3;
  const savedCard = me?.cards.find((card) => card.id === method);
  const usingSavedCard = method !== "new" && Boolean(savedCard);

  // Keep what was typed if the person goes back to the hall, or is sent there.
  const paid = useRef(false);
  useEffect(
    () => () => {
      if (paid.current) return;
      const { cvc: _cvc, savedCvc: _savedCvc, ...rest } = getValues();
      checkoutDraft.current = rest;
    },
    [getValues, checkoutDraft],
  );

  // Signing in, at any moment, fills in only what the person hasn't typed.
  const previousAccount = useRef<Account | null | undefined>(undefined);
  useEffect(() => {
    if (me === undefined) return;
    const was = previousAccount.current;
    previousAccount.current = me;
    if (me && was?.email !== me.email) {
      const values = getValues();
      const quietly = { shouldDirty: true } as const;
      if (!values.email.trim()) setValue("email", me.email, quietly);
      if (!values.name.trim()) setValue("name", me.name, quietly);
      if (me.billing && !values.line1.trim() && !values.city.trim() && !values.postalCode.trim()) {
        setValue("country", me.billing.country, quietly);
        setValue("line1", me.billing.line1, quietly);
        setValue("line2", me.billing.line2 ?? "", quietly);
        setValue("city", me.billing.city, quietly);
        setValue("postalCode", me.billing.postalCode, quietly);
      }
      const usable = me.cards.find((card) => !savedCardExpired(card));
      if (usable && values.method === "new" && !digitsOf(values.number)) setValue("method", usable.id);
    }
    if (!me && was && getValues("method") !== "new") setValue("method", "new");
  }, [me, getValues, setValue]);

  // A country's postal code format changes with the country.
  useEffect(() => {
    if (getFieldState("postalCode").isTouched) void trigger("postalCode");
  }, [country, getFieldState, trigger]);

  // Required fields are marked as such up front; an empty one is only called
  // out once the person has tried to pay.
  const attempted = useRef(false);
  const needs = (message: string, check: (value: string) => true | string, applies = () => true) =>
    (value: string) => {
      if (!applies()) return true;
      if (!value.trim()) return attempted.current ? message : true;
      return check(value);
    };
  const forNewCard = () => getValues("method") === "new";
  const forSavedCard = () => getValues("method") !== "new";

  const [paymentError, setPaymentError] = useState<{ message: string; at: number } | null>(null);
  const paymentErrorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (paymentError) paymentErrorRef.current?.focus();
  }, [paymentError]);

  const placeOrder = useMutation({ mutationFn: api.placeOrder });
  // Set the moment Pay is pressed, so no second press, tap or Enter can send another payment.
  const paying = useRef(false);

  const onValid = async (values: CheckoutValues) => {
    setPaymentError(null);
    const order: NewOrder = {
      performanceId,
      seatIds: chosen.map(({ seat }) => seat.id),
      email: usingSavedCard && me ? me.email : values.email.trim(),
      payment:
        usingSavedCard && savedCard
          ? { savedCardId: savedCard.id, cvc: digitsOf(values.savedCvc) }
          : {
              card: {
                number: digitsOf(values.number),
                ...(({ month, year }) => ({ expMonth: month, expYear: year }))(parseExpiry(values.expiry)),
                cvc: digitsOf(values.cvc),
                name: values.name.trim(),
              },
              billing: {
                line1: values.line1.trim(),
                line2: values.line2.trim() || null,
                city: values.city.trim(),
                postalCode: normalizePostalCode(values.postalCode, values.country),
                country: values.country,
              },
            },
    };

    setPaying(true);
    try {
      const result = await placeOrder.mutateAsync(order);
      paid.current = true;
      completeOrder(result);
      void queryClient.invalidateQueries({ queryKey: queryKeys.production });
      void queryClient.invalidateQueries({ queryKey: queryKeys.seatMap(performanceId) });
      navigate("/tickets");
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setPaying(false);
        throw error;
      }
      const codeField = usingSavedCard ? "savedCvc" : "cvc";
      switch (error.code) {
        case "card_declined":
        case "insufficient_funds":
          // The code is asked for afresh; that it is empty is not yet a mistake.
          resetField(codeField, { defaultValue: "" });
          setPaymentError({ message: error.message, at: Date.now() });
          break;
        case "invalid": {
          const field = error.field === "cvc" ? codeField : SERVICE_FIELDS[error.field ?? ""];
          const shown = field && (field === codeField || !usingSavedCard);
          if (shown) {
            setError(field, { type: "server", message: error.message }, { shouldFocus: true });
          } else {
            setPaymentError({ message: error.message, at: Date.now() });
          }
          break;
        }
        case "unavailable": {
          // Nothing was charged. The lost seats leave the choice, and the
          // person goes back to the hall with the rest of it.
          const lost = error.conflicts ?? [];
          loseSeats(lost, error.message);
          markSeatsSold(queryClient, performanceId, lost);
          navigate(`/performances/${performanceId}`);
          break;
        }
        case "signed_out":
          queryClient.setQueryData(queryKeys.me, null);
          setPaymentError({ message: error.message, at: Date.now() });
          break;
        default:
          setPaymentError({ message: error.message, at: Date.now() });
      }
      setPaying(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (paying.current) return;
    paying.current = true;
    attempted.current = true;
    void handleSubmit(
      async (values) => {
        try {
          await onValid(values);
        } finally {
          paying.current = false;
        }
      },
      () => {
        paying.current = false;
      },
    )(event);
  };

  // Paying empties the choice; that is not a reason to go back to the hall.
  if (paid.current || completedOrder) return null;
  if (chosen.length === 0) return <Navigate to={`/performances/${performanceId}`} replace />;

  const cards = me?.cards ?? [];
  const busy = placeOrder.isPending;

  return (
    <>
      <SiteHeader back={<BackLink to={`/performances/${performanceId}`}>Back to seats</BackLink>} />
      <main className={styles.page}>
        <header className={styles.head}>
          <h1 ref={heading} tabIndex={-1} className={styles.title}>
            Checkout
          </h1>
          <p className={styles.sub}>
            {production.title} · {formatDate(performance.startsAt)} · {formatTime(performance.startsAt)}
          </p>
        </header>

        <Notices />

        <form className={styles.layout} noValidate onSubmit={onSubmit} aria-busy={busy}>
          <div className={styles.fields}>
            {!me && (
              <p className={styles.signInPrompt}>
                Booked with us before?{" "}
                <button type="button" className="link" onClick={openSignIn}>
                  Use your account
                </button>{" "}
                for your saved cards and address. Or simply carry on — no account needed.
              </p>
            )}

            <section className={styles.group} aria-labelledby="payment-heading">
              <h2 id="payment-heading" className={styles.groupTitle} tabIndex={-1} data-after-sign-in>
                Payment
              </h2>

              {paymentError && (
                <div
                  key={paymentError.at}
                  ref={paymentErrorRef}
                  className={styles.paymentError}
                  role="alert"
                  tabIndex={-1}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="8" cy="8" r="7" />
                    <path d="M8 4.5v4.2M8 11.2v.3" />
                  </svg>
                  <p>{paymentError.message}</p>
                </div>
              )}

              {cards.length > 0 && (
                <fieldset className={styles.methods}>
                  <legend className="visually-hidden">Pay with</legend>
                  {cards.map((card) => {
                    const expired = savedCardExpired(card);
                    const expiry = formatCardExpiry(card.expMonth, card.expYear);
                    return (
                      <label key={card.id} className={styles.method} data-expired={expired || undefined}>
                        <input
                          type="radio"
                          value={card.id}
                          disabled={expired}
                          className={styles.radio}
                          {...register("method")}
                        />
                        <CardBadge brand={card.brand} />
                        <span className={styles.methodText}>
                          <span className={styles.methodName}>
                            {BRAND_NAMES[card.brand]}{" "}
                            <span aria-hidden="true" className={styles.dots}>
                              ••••
                            </span>
                            <span className="visually-hidden">ending in</span> {card.last4}
                          </span>
                          <span className={styles.methodExpiry}>
                            {expired ? `Expired ${expiry}` : `Expires ${expiry}`}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                  <label className={styles.method}>
                    <input type="radio" value="new" className={styles.radio} {...register("method")} />
                    <span className={styles.newCardMark} aria-hidden="true">+</span>
                    <span className={styles.methodName}>A new card</span>
                  </label>
                </fieldset>
              )}

              {usingSavedCard && savedCard ? (
                <div className={styles.savedPay}>
                  <TextField
                    label="Security code"
                    hint={
                      savedCard.brand === "amex"
                        ? `The 4 digits on the front of your ${BRAND_NAMES[savedCard.brand]} card ending ${savedCard.last4}`
                        : `The 3 digits on the back of your ${BRAND_NAMES[savedCard.brand]} card ending ${savedCard.last4}`
                    }
                    className={styles.short}
                    error={errors.savedCvc?.message}
                    registration={register("savedCvc", {
                      validate: needs(
                        "Enter your card's security code.",
                        (value) => checkSecurityCode(value, savedCard.brand === "amex" ? 4 : 3),
                        forSavedCard,
                      ),
                    })}
                    format={(value) => digitsOf(value).slice(0, savedCard.brand === "amex" ? 4 : 3)}
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    maxLength={savedCard.brand === "amex" ? 4 : 3}
                    enterKeyHint="go"
                  />
                  <p className={styles.sendTo}>Tickets will be sent to {me?.email}</p>
                </div>
              ) : (
                newCardFields()
              )}
            </section>
          </div>

          <aside className={styles.summary} aria-labelledby="summary-heading">
            <section className={styles.seats}>
              <h2 id="summary-heading" className={styles.groupTitle}>
                {plural(chosen.length, "seat")}
              </h2>
              <ul className={styles.lines}>
                {chosen.map(({ seat, section, row }) => (
                  <li key={seat.id} className={styles.line}>
                    <span className={styles.lineSeat}>
                      {section.name}, row {row}, seat {seat.number}
                    </span>
                    <span className="amount">{formatMoney(section.priceCents)}</span>
                    <span className={styles.fee}>Booking fee</span>
                    <span className={`amount ${styles.fee}`}>{formatMoney(section.feeCents)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <div className={styles.payBar} data-pay-bar>
              <p className={styles.total}>
                <span>Total</span>
                <span className="amount" aria-live="polite">
                  {formatMoney(totalCents)}
                </span>
              </p>
              <button
                type="submit"
                className={`button button-primary ${styles.payButton}`}
                aria-disabled={busy || undefined}
                data-busy={busy || undefined}
              >
                {busy && <span className="spinner" aria-hidden="true" />}
                {pay}
              </button>
              <p className={styles.payStatus} role="status">
                {busy ? "Taking payment — this takes a moment." : ""}
              </p>
              <p className={styles.reassure}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <rect x="3" y="7" width="10" height="7" rx="1.5" />
                  <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                </svg>
                Your card goes only to the Grand Hall box office.
              </p>
            </div>
          </aside>
        </form>
      </main>
    </>
  );

  // Called, not mounted as a component, so its inputs keep their identity between renders.
  function newCardFields() {
    return (
      <>
        <p className={styles.required}>Every field is needed unless it says optional.</p>

        <TextField
          label="Email address"
          hint="Your tickets are sent here."
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="next"
          error={errors.email?.message}
          registration={register("email", {
            validate: needs("Enter the email address to send your tickets to.", checkEmail, forNewCard),
          })}
        />

        <TextField
          label="Name on card"
          autoComplete="cc-name"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="next"
          error={errors.name?.message}
          registration={register("name", {
            validate: needs("Enter the name as it's printed on the card.", () => true, forNewCard),
          })}
        />

        <TextField
          label="Card number"
          inputMode="numeric"
          autoComplete="cc-number"
          enterKeyHint="next"
          maxLength={23}
          format={formatCardNumber}
          error={errors.number?.message}
          adornment={
            <span className={styles.kind} aria-live="polite">
              {kind && <CardBadge brand={kind.name} />}
              <span className="visually-hidden">{kind?.name}</span>
            </span>
          }
          registration={register("number", {
            validate: needs("Enter the long number on the front of your card.", checkCardNumber, forNewCard),
          })}
        />

        <div className={styles.pair}>
          <TextField
            label="Expiry date"
            hint="MM / YY"
            inputMode="numeric"
            autoComplete="cc-exp"
            enterKeyHint="next"
            maxLength={7}
            format={formatExpiry}
            error={errors.expiry?.message}
            registration={register("expiry", {
              validate: needs("Enter the card's expiry date.", checkExpiry, forNewCard),
            })}
          />
          <TextField
            label="Security code"
            hint={codeSize === 4 ? "4 digits, on the front" : "3 digits, on the back"}
            inputMode="numeric"
            autoComplete="cc-csc"
            enterKeyHint="next"
            maxLength={codeSize}
            format={(value) => digitsOf(value).slice(0, codeSize)}
            error={errors.cvc?.message}
            registration={register("cvc", {
              validate: needs(
                "Enter the card's security code.",
                (value) => checkSecurityCode(value, cardKind(getValues("number"))?.codeSize ?? 3),
                forNewCard,
              ),
            })}
          />
        </div>

        <fieldset className={styles.address}>
          <legend className={styles.groupTitle}>Billing address</legend>

          <SelectField
            label="Country"
            autoComplete="billing country"
            error={errors.country?.message}
            registration={register("country")}
          >
            {COUNTRIES.map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </SelectField>

          <TextField
            label="Street address"
            autoComplete="billing address-line1"
            enterKeyHint="next"
            error={errors.line1?.message}
            registration={register("line1", {
              validate: needs("Enter the street address your card is registered to.", () => true, forNewCard),
            })}
          />

          <TextField
            label="Address line 2"
            optional
            autoComplete="billing address-line2"
            enterKeyHint="next"
            registration={register("line2")}
          />

          <div className={styles.pair}>
            <TextField
              label="City"
              autoComplete="billing address-level2"
              enterKeyHint="next"
              error={errors.city?.message}
              registration={register("city", {
                validate: needs("Enter the town or city.", () => true, forNewCard),
              })}
            />
            <TextField
              label="Postal code"
              autoComplete="billing postal-code"
              inputMode={postalIsNumeric(country) ? "numeric" : "text"}
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="go"
              error={errors.postalCode?.message}
              registration={register("postalCode", {
                validate: needs(
                  "Enter the postal code your card is registered to.",
                  (value) => checkPostalCode(value, getValues("country")),
                  forNewCard,
                ),
                onBlur: (event) => {
                  const tidy = normalizePostalCode(event.target.value, getValues("country"));
                  if (tidy !== event.target.value) setValue("postalCode", tidy);
                },
              })}
            />
          </div>
        </fieldset>
      </>
    );
  }
}

