import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Lock,
  X,
  Eye,
  Ticket,
  ArrowUpRight,
} from "lucide-react";
import JsBarcode from "jsbarcode";
import { money, brand, formatCard, expired, validate } from "./validation";
import "./styles.css";
const API = "http://127.0.0.1:8351";
async function api(path, options = {}) {
  const res = await fetch(API + path, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw data;
  return data;
}
const date = (s) =>
  new Date(s)
    .toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
    .replace(",", "");
const time = (s) =>
  new Date(s)
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(" ", "")
    .toLowerCase();
const initial = {
  email: "",
  name: "",
  number: "",
  expiry: "",
  cvc: "",
  line1: "",
  line2: "",
  city: "",
  postalCode: "",
  country: "US",
};
function App() {
  const [production, setProduction] = useState(null),
    [perf, setPerf] = useState(null),
    [sections, setSections] = useState([]),
    [selected, setSelected] = useState([]),
    [step, setStep] = useState("dates"),
    [me, setMe] = useState(null),
    [login, setLogin] = useState(false),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false),
    [form, setForm] = useState(initial),
    [saved, setSaved] = useState(""),
    [errors, setErrors] = useState({}),
    [touched, setTouched] = useState({}),
    [busy, setBusy] = useState(false),
    [order, setOrder] = useState(null),
    [ticketIndex, setTicketIndex] = useState(0),
    [mobileSection, setMobileSection] = useState("ORCH"),
    [mobileRow, setMobileRow] = useState("A");
  const [narrow, setNarrow] = useState(
    window.matchMedia("(max-width: 600px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 600px)");
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const editedFields = useRef(new Set());
  const paymentLock = useRef(false),
    heading = useRef(null),
    selectionRef = useRef(selected);
  selectionRef.current = selected;
  function hydrate(user) {
    setMe(user);
    if (user) {
      setForm((f) => ({
        ...f,
        email: editedFields.current.has("email") ? f.email : user.email,
        name: editedFields.current.has("name") ? f.name : user.name,
        ...Object.fromEntries(
          Object.entries(user.billing).map(([k, v]) => [
            k,
            editedFields.current.has(k) ? f[k] : v || "",
          ]),
        ),
        country: editedFields.current.has("country")
          ? f.country
          : user.billing.country,
      }));
      setSaved(
        user.cards.find((c) => !expired(c.expMonth, c.expYear))?.id || "",
      );
    }
  }
  useEffect(() => {
    api("/api/production")
      .then(setProduction)
      .catch((e) =>
        setNotice(e.message || "Could not load performances. Please reload."),
      );
    api("/api/me")
      .then(hydrate)
      .catch(() => {});
  }, []);
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo(0, 0);
  }, [step]);
  useEffect(() => {
    if (!perf || step === "tickets") return;
    const events = new EventSource(`${API}/api/events?performance=${perf.id}`, {
      withCredentials: true,
    });
    let active = true;
    const lose = (ids) => {
      if (!active) return;
      const lost = selectionRef.current.filter((s) => ids.includes(s.id));
      if (lost.length && !paymentLock.current)
        setNotice(
          `${lost.map((s) => `${s.section}, row ${s.row}, seat ${s.number}`).join("; ")} is no longer available. Please choose another seat.`,
        );
      setSelected((s) => s.filter((x) => !ids.includes(x.id)));
    };
    events.addEventListener("seatchanged", (e) => {
      const change = JSON.parse(e.data);
      setSections((ss) =>
        ss.map((s) => ({
          ...s,
          rows: s.rows.map((r) => ({
            ...r,
            seats: r.seats.map((x) =>
              x.id === change.seatId ? { ...x, status: "sold" } : x,
            ),
          })),
        })),
      );
      lose([change.seatId]);
    });
    events.onopen = () => {
      api(`/api/performances/${perf.id}/seats`)
        .then((data) => {
          if (!active) return;
          setSections(data.sections);
          lose(
            data.sections.flatMap((s) =>
              s.rows.flatMap((r) =>
                r.seats.filter((x) => x.status === "sold").map((x) => x.id),
              ),
            ),
          );
        })
        .catch(() => {});
    };
    return () => {
      active = false;
      events.close();
    };
  }, [perf, step === "tickets"]);
  const subtotal = selected.reduce((a, s) => a + s.priceCents, 0),
    fees = selected.reduce((a, s) => a + s.feeCents, 0),
    total = subtotal + fees;
  async function choose(p) {
    setLoading(true);
    setNotice("");
    try {
      const data = await api(`/api/performances/${p.id}/seats`);
      setSections(data.sections);
      setSelected([]);
      setPerf(p);
      setMobileSection(data.sections[0].key);
      setMobileRow(data.sections[0].rows[0].name);
      setStep("seats");
    } catch (e) {
      setNotice(e.message || "Could not load seats. Try again.");
    } finally {
      setLoading(false);
    }
  }
  function toggle(s, r, seat) {
    if (seat.status === "sold") return;
    setSelected((old) =>
      old.some((x) => x.id === seat.id)
        ? old.filter((x) => x.id !== seat.id)
        : [
            ...old,
            {
              ...seat,
              section: s.name,
              row: r.name,
              priceCents: s.priceCents,
              feeCents: s.feeCents,
            },
          ],
    );
  }
  function change(key, value) {
    editedFields.current.add(key);
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }
  const chosenCard = me?.cards.find((c) => c.id === saved),
    validation = validate(form, chosenCard?.brand);
  function field(key, label, props = {}) {
    const error = errors[key] || (touched[key] && validation[key]);
    return (
      <label className={`field ${error ? "invalid" : ""}`} key={key}>
        <span>
          {label}
          {key === "line2" ? (
            <small>Optional</small>
          ) : (
            <span aria-hidden="true"> *</span>
          )}
        </span>
        <input
          id={key}
          name={key}
          value={form[key]}
          required={key !== "line2"}
          onChange={(e) =>
            change(
              key,
              key === "number"
                ? formatCard(e.target.value)
                : key === "expiry"
                  ? e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 4)
                      .replace(/^(\d{2})(\d)/, "$1 / $2")
                  : e.target.value,
            )
          }
          onFocus={(event) => {
            if (narrow) {
              const input = event.currentTarget;
              requestAnimationFrame(() =>
                input.scrollIntoView({ block: "center", behavior: "smooth" }),
              );
            }
          }}
          onBlur={() => setTouched((t) => ({ ...t, [key]: true }))}
          aria-invalid={!!error}
          aria-describedby={error ? `${key}-error` : undefined}
          {...props}
        />
        {error && (
          <span id={`${key}-error`} className="field-error" role="alert">
            {error}
          </span>
        )}
      </label>
    );
  }
  async function pay(e) {
    e.preventDefault();
    if (paymentLock.current) return;
    const errs = validate(form, chosenCard?.brand);
    setErrors(errs);
    setTouched(Object.fromEntries(Object.keys(form).map((k) => [k, true])));
    if (Object.keys(errs).length) {
      document.getElementById(Object.keys(errs)[0])?.focus();
      return;
    }
    if (!selected.length) {
      setStep("seats");
      setNotice("Please choose your seats.");
      return;
    }
    paymentLock.current = true;
    setBusy(true);
    setNotice("");
    const [month, year] = form.expiry.split("/").map(Number);
    try {
      const result = await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          performanceId: perf.id,
          seatIds: selected.map((s) => s.id),
          email: form.email,
          payment: chosenCard
            ? { savedCardId: saved, cvc: form.cvc }
            : {
                card: {
                  number: form.number.replace(/\D/g, ""),
                  expMonth: month,
                  expYear: 2000 + year,
                  cvc: form.cvc,
                  name: form.name,
                },
                billing: {
                  line1: form.line1,
                  line2: form.line2,
                  city: form.city,
                  postalCode: form.postalCode,
                  country: form.country,
                },
              },
        }),
      });
      setNotice("");
      setOrder(result);
      setTicketIndex(0);
      setStep("tickets");
      setForm((f) => ({ ...f, number: "", cvc: "", expiry: "" }));
    } catch (err) {
      setNotice(
        err.message || "Payment could not be completed. Please try again.",
      );
      setForm((f) => ({ ...f, cvc: "" }));
      if (err.field) {
        setErrors({ [err.field]: err.message });
        setTimeout(() => document.getElementById(err.field)?.focus(), 0);
      }
      if (err.error === "unavailable") {
        setSelected((s) => s.filter((x) => !err.conflicts.includes(x.id)));
        setSections((ss) =>
          ss.map((s) => ({
            ...s,
            rows: s.rows.map((r) => ({
              ...r,
              seats: r.seats.map((x) =>
                err.conflicts.includes(x.id) ? { ...x, status: "sold" } : x,
              ),
            })),
          })),
        );
        setStep("seats");
      }
    } finally {
      paymentLock.current = false;
      setBusy(false);
    }
  }
  const currentSection = sections.find((s) => s.key === mobileSection),
    currentRow = currentSection?.rows.find((r) => r.name === mobileRow);
  return (
    <>
      <header>
        <a
          className="wordmark"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            if (!busy) setStep("dates");
          }}
        >
          THE VENUE<span className="brand-dot">●</span>
        </a>
        <span className="header-season">A SEASON TO BE HERE · 2026 / 27</span>
        <button
          className="text-button"
          onClick={async () => {
            if (me) {
              try {
                await api("/api/session", { method: "DELETE" });
                setMe(null);
                setSaved("");
              } catch (e) {
                setNotice(e.message);
              }
            } else setLogin(true);
          }}
          disabled={busy}
        >
          {me ? `Sign out · ${me.name.split(" ")[0]}` : "Sign in"}
          <ArrowUpRight size={15} />
        </button>
      </header>
      <main>
        {notice && (
          <div className="notice" role="alert">
            {notice}
            <button aria-label="Dismiss message" onClick={() => setNotice("")}>
              <X size={17} />
            </button>
          </div>
        )}
        {step === "dates" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">OPERA · WOLFGANG AMADEUS MOZART</div>
                <h1 ref={heading} tabIndex={-1}>
                  The Marriage
                  <br />
                  of <em>Figaro.</em>
                </h1>
                <p>
                  One house. One wedding.
                  <br />A glorious tangle of hearts.
                </p>
                <div className="production-meta">
                  <span>{production?.hall || "Grand Hall"}</span>
                  <span>{production?.runningTime || "3h 10m"}</span>
                  <span>2026 / 27 season</span>
                </div>
              </div>
              <div
                className="poster"
                aria-label="Abstract theatrical artwork: red curtains framing an illuminated arch"
                role="img"
              >
                <div className="poster-lines" />
                <div className="arch arch-back" />
                <div className="arch arch-front" />
                <div className="poster-floor" />
                <span className="poster-top">
                  A LITTLE CHAOS.
                  <br />A LOT OF MOZART.
                </span>
                <span className="poster-bottom">
                  FIGARO<span>THE GRAND HALL</span>
                </span>
                <div className="poster-circle">
                  13 NOV
                  <br />
                  <span>—</span>
                  <br />
                  16 DEC
                </div>
              </div>
            </section>
            <section className="performances">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">MAKE AN EVENING OF IT</div>
                  <h2>Find your performance</h2>
                </div>
                <span className="muted">
                  {production?.performances.length || 20} performances · From
                  $35.00
                </span>
              </div>
              <div className="performance-table">
                <div className="table-head">
                  <span>DATE</span>
                  <span>TIME</span>
                  <span>AVAILABILITY</span>
                  <span>FROM</span>
                  <span />
                </div>
                {!production ? (
                  <p className="loading">Loading performances…</p>
                ) : (
                  production.performances.map((p) => (
                    <button
                      className="performance"
                      key={p.id}
                      onClick={() => choose(p)}
                      disabled={loading}
                      aria-label={`${date(p.startsAt)}, ${time(p.startsAt)}, from ${money(p.priceFromCents)}, ${p.seatsLeft} seats left`}
                    >
                      <span className="performance-date">
                        {date(p.startsAt)}
                      </span>
                      <span>{time(p.startsAt)}</span>
                      <span
                        className={`availability ${p.seatsLeft / p.seats < 0.15 ? "scarce" : ""}`}
                      >
                        <span className="availability-track">
                          <i
                            style={{
                              width: `${(100 * p.seatsLeft) / p.seats}%`,
                            }}
                          />
                        </span>
                        <span>
                          {p.seatsLeft / p.seats < 0.15
                            ? "Almost full"
                            : p.seatsLeft / p.seats < 0.4
                              ? "Filling up"
                              : "Good availability"}
                          <small>{p.seatsLeft} seats left</small>
                        </span>
                      </span>
                      <span className="price">{money(p.priceFromCents)}</span>
                      <ArrowUpRight size={20} />
                    </button>
                  ))
                )}
              </div>
            </section>
          </>
        )}
        {step === "seats" && (
          <>
            <nav className="step-nav">
              <button onClick={() => setStep("dates")}>
                <ArrowLeft size={16} /> Performances
              </button>
              <span>
                01 SELECT SEATS <span>—</span> 02 CHECKOUT <span>—</span> 03
                YOUR TICKETS
              </span>
            </nav>
            <div className="section-heading seat-heading">
              <div>
                <div className="eyebrow">
                  {production.title} · {date(perf.startsAt)} ·{" "}
                  {time(perf.startsAt)}
                </div>
                <h1 ref={heading} tabIndex={-1}>
                  Find your place.
                </h1>
              </div>
              <div className="legend">
                <span>
                  <i className="sample available" />
                  Available
                </span>
                <span>
                  <i className="sample selected">✓</i>Yours
                </span>
                <span>
                  <i className="sample sold">×</i>Taken
                </span>
              </div>
            </div>
            <div className="hall-layout">
              <div className="hall">
                <div className="stage">
                  STAGE<span>THE GRAND HALL</span>
                </div>
                <div className="seat-map" inert={narrow} aria-hidden={narrow}>
                  {sections.map((s) => (
                    <section className="hall-section" key={s.key}>
                      <div className="hall-section-title">
                        {s.name}
                        <span>{money(s.priceCents)}</span>
                      </div>
                      {s.rows.map((r, ri) => (
                        <div className="seat-row" key={r.name}>
                          <span className="row-name">{r.name}</span>
                          <div className="row-seats">
                            {r.seats.map((seat, i) => {
                              const active = selected.some(
                                (x) => x.id === seat.id,
                              );
                              return (
                                <button
                                  key={seat.id}
                                  className={`seat ${seat.status === "sold" ? "sold" : active ? "selected" : "available"}`}
                                  style={{
                                    "--curve": `${Math.pow((i - (r.seats.length - 1) / 2) / (r.seats.length / 2), 2) * -19}px`,
                                  }}
                                  aria-label={`${s.name}, row ${r.name}, seat ${seat.number}`}
                                  aria-description={`${money(s.priceCents)}, ${seat.status === "sold" ? "taken" : active ? "selected" : "available"}`}
                                  aria-pressed={active}
                                  aria-disabled={seat.status === "sold"}
                                  onClick={() => toggle(s, r, seat)}
                                  title={`${s.name} ${r.name}${seat.number} · ${money(s.priceCents)}`}
                                >
                                  {seat.status === "sold"
                                    ? "×"
                                    : active
                                      ? "✓"
                                      : ""}
                                </button>
                              );
                            })}
                          </div>
                          <span className="row-name">{r.name}</span>
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
                <div className="mobile-seat-picker">
                  <div className="eyebrow">CHOOSE A SECTION & ROW</div>
                  <div className="picker-selects">
                    <label>
                      Section
                      <select
                        value={mobileSection}
                        onChange={(e) => {
                          setMobileSection(e.target.value);
                          setMobileRow(
                            sections.find((s) => s.key === e.target.value)
                              .rows[0].name,
                          );
                        }}
                      >
                        {sections.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.name} · {money(s.priceCents)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Row
                      <select
                        value={mobileRow}
                        onChange={(e) => setMobileRow(e.target.value)}
                      >
                        {currentSection?.rows.map((r) => (
                          <option key={r.name}>{r.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="muted">Tap a numbered seat to select it.</p>
                  <div className="thumb-seats">
                    {currentRow?.seats.map((seat) => {
                      const active = selected.some((x) => x.id === seat.id);
                      return (
                        <button
                          key={seat.id}
                          className={`seat ${seat.status === "sold" ? "sold" : active ? "selected" : "available"}`}
                          aria-label={`${currentSection.name}, row ${currentRow.name}, seat ${seat.number}`}
                          aria-description={`${money(currentSection.priceCents)}, ${seat.status === "sold" ? "taken" : active ? "selected" : "available"}`}
                          aria-pressed={active}
                          disabled={seat.status === "sold"}
                          onClick={() =>
                            toggle(currentSection, currentRow, seat)
                          }
                        >
                          {seat.status === "sold"
                            ? "×"
                            : active
                              ? "✓"
                              : seat.number}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <aside className="selection-panel">
                <div className="eyebrow">YOUR EVENING</div>
                <h3>
                  The Marriage
                  <br />
                  of Figaro
                </h3>
                <p>
                  {date(perf.startsAt)} · {time(perf.startsAt)}
                  <br />
                  <span className="muted">Grand Hall</span>
                </p>
                <div className="selected-list">
                  {selected.length ? (
                    selected.map((s) => (
                      <div key={s.id}>
                        <span>
                          {s.section}
                          <small>
                            Row {s.row} · Seat {s.number}
                          </small>
                        </span>
                        <span>{money(s.priceCents)}</span>
                        <button
                          aria-label={`Remove ${s.section}, row ${s.row}, seat ${s.number}`}
                          onClick={() =>
                            setSelected((a) => a.filter((x) => x.id !== s.id))
                          }
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="empty-selection">
                      A great evening starts
                      <br />
                      with your favourite seat.
                      <br />
                      <span>Choose a seat in the hall.</span>
                    </p>
                  )}
                </div>
                <div className="selection-bottom">
                  <strong aria-live="polite">
                    {selected.length} seats · {money(subtotal)}
                  </strong>
                  <small>Booking fees added at checkout</small>
                  <button
                    className="primary"
                    disabled={!selected.length}
                    onClick={() => {
                      setNotice("");
                      setStep("checkout");
                    }}
                  >
                    Continue to checkout <ArrowRight size={18} />
                  </button>
                </div>
                <p className="secure-note">
                  <Lock size={12} /> Secure checkout · No account needed
                </p>
              </aside>
            </div>
          </>
        )}
        {step === "checkout" && (
          <>
            <nav className="step-nav">
              <button disabled={busy} onClick={() => setStep("seats")}>
                <ArrowLeft size={16} /> Your seats
              </button>
              <span>
                01 SELECT SEATS <span>—</span> 02 CHECKOUT <span>—</span> 03
                YOUR TICKETS
              </span>
            </nav>
            <div className="checkout-title">
              <div className="eyebrow">JUST A FEW DETAILS</div>
              <h1 ref={heading} tabIndex={-1}>
                An evening to look forward to.
              </h1>
              <p className="muted">Your tickets, straight to your inbox.</p>
            </div>
            <div className="checkout-layout">
              <form
                id="checkout-payment"
                onSubmit={pay}
                noValidate
                className="checkout-form"
              >
                <fieldset disabled={busy}>
                  <h2>
                    <span>01</span> Your details
                  </h2>
                  {!me && (
                    <p className="signin-prompt">
                      Already been here?{" "}
                      <button type="button" onClick={() => setLogin(true)}>
                        Sign in
                      </button>{" "}
                      for your saved details.
                    </p>
                  )}
                  {field("email", "Email address", {
                    type: "email",
                    autoComplete: "email",
                    inputMode: "email",
                  })}
                  <h2>
                    <span>02</span> Payment
                  </h2>
                  {me?.cards.map((c) => (
                    <label
                      className={`saved-card ${saved === c.id ? "chosen" : ""}`}
                      key={c.id}
                    >
                      <input
                        type="radio"
                        name="payment-method"
                        checked={saved === c.id}
                        disabled={expired(c.expMonth, c.expYear)}
                        onChange={() => {
                          setSaved(c.id);
                          change("cvc", "");
                          setTouched({});
                          setErrors({});
                        }}
                      />
                      <span>
                        <b>
                          {c.brand === "visa"
                            ? "Visa"
                            : c.brand === "mastercard"
                              ? "Mastercard"
                              : c.brand}{" "}
                          ···· {c.last4}
                        </b>
                        <small>
                          {expired(c.expMonth, c.expYear)
                            ? "Expired"
                            : "Expires"}{" "}
                          {String(c.expMonth).padStart(2, "0")} / {c.expYear}
                        </small>
                      </span>
                    </label>
                  ))}
                  {me && (
                    <label className={`saved-card ${!saved ? "chosen" : ""}`}>
                      <input
                        type="radio"
                        name="payment-method"
                        checked={!saved}
                        onChange={() => {
                          setSaved("");
                          change("cvc", "");
                          setTouched({});
                          setErrors({});
                        }}
                      />
                      Use a new card
                    </label>
                  )}
                  {!chosenCard && (
                    <>
                      {field("name", "Name on card", {
                        autoComplete: "cc-name",
                      })}
                      <div className="card-number-wrap">
                        {field("number", "Card number", {
                          autoComplete: "cc-number",
                          inputMode: "numeric",
                        })}
                        <span className="card-brand">
                          {brand(form.number) || "CARD"}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="form-row">
                    {!chosenCard &&
                      field("expiry", "Expiry", {
                        placeholder: "MM / YY",
                        autoComplete: "cc-exp",
                        inputMode: "numeric",
                      })}
                    {field("cvc", "Security code", {
                      autoComplete: "cc-csc",
                      inputMode: "numeric",
                      type: "password",
                      maxLength:
                        (chosenCard?.brand || brand(form.number)) === "amex"
                          ? 4
                          : 3,
                    })}
                  </div>
                  {!chosenCard && (
                    <>
                      <h2>
                        <span>03</span> Billing address
                      </h2>
                      <label className="field">
                        <span>Country *</span>
                        <select
                          id="country"
                          autoComplete="country"
                          value={form.country}
                          onChange={(e) => change("country", e.target.value)}
                        >
                          <option value="US">United States</option>
                          <option value="CA">Canada</option>
                          <option value="GB">United Kingdom</option>
                        </select>
                      </label>
                      {field("line1", "Street address", {
                        autoComplete: "address-line1",
                      })}
                      {field("line2", "Address line 2", {
                        autoComplete: "address-line2",
                      })}
                      <div className="form-row">
                        {field("city", "City", {
                          autoComplete: "address-level2",
                        })}
                        {field("postalCode", "Postal code", {
                          autoComplete: "postal-code",
                        })}
                      </div>
                    </>
                  )}
                  <div className="pay-area">
                    <button
                      type="submit"
                      className="primary"
                      disabled={busy || !selected.length}
                    >
                      {busy ? "Processing payment…" : `Pay ${money(total)}`}
                      <Lock size={16} />
                    </button>
                    <p className="secure-note">
                      Secure payment. Electronic tickets. A wonderful evening.
                    </p>
                  </div>
                </fieldset>
              </form>
              <aside className="order-summary">
                <div className="eyebrow">YOUR EVENING</div>
                <h3>
                  The Marriage
                  <br />
                  of Figaro
                </h3>
                <p>
                  {date(perf.startsAt)} · {time(perf.startsAt)}
                  <br />
                  <span className="muted">
                    Grand Hall · {production.runningTime}
                  </span>
                </p>
                <div className="summary-seats">
                  {selected.map((s) => (
                    <div key={s.id}>
                      <span>
                        {s.section} · {s.row}
                        {s.number}
                        <small>Booking fee</small>
                      </span>
                      <span>
                        {money(s.priceCents)}
                        <small>{money(s.feeCents)}</small>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="summary-total">
                  <span>Total</span>
                  <strong>{money(total)}</strong>
                </div>
                <p className="secure-note">
                  <Ticket size={16} /> Delivered to your email. Nothing to
                  collect.
                </p>
                <p className="summary-foot">
                  Doors open at {time(perf.doorsAt)}.<br />
                  We look forward to welcoming you.
                </p>
              </aside>
            </div>
            <div className="mobile-payment">
              <span>
                Total <strong>{money(total)}</strong>
              </span>
              <button
                className="primary"
                type="submit"
                form="checkout-payment"
                disabled={busy || !selected.length}
              >
                {busy ? "Processing payment…" : `Pay ${money(total)}`}
                <Lock size={15} />
              </button>
            </div>
          </>
        )}
        {step === "tickets" && order && (
          <section className="tickets-page">
            <div className="success-icon">
              <Check />
            </div>
            <div className="eyebrow">CONFIRMED · {order.code}</div>
            <h1 ref={heading} tabIndex={-1}>
              The evening is yours.
            </h1>
            <p>Sent to {order.email}</p>
            <div className="ticket-controls">
              <button
                aria-label="Previous ticket"
                disabled={ticketIndex === 0}
                onClick={() => setTicketIndex((i) => i - 1)}
              >
                <ArrowLeft size={18} />
              </button>
              <span aria-live="polite">
                Ticket {ticketIndex + 1} of {order.tickets.length}
              </span>
              <button
                aria-label="Next ticket"
                disabled={ticketIndex === order.tickets.length - 1}
                onClick={() => setTicketIndex((i) => i + 1)}
              >
                <ArrowRight size={18} />
              </button>
            </div>
            <TicketCard
              ticket={order.tickets[ticketIndex]}
              perf={perf}
              production={production}
            />
            <p className="muted">
              Show this code at the door. Your evening awaits.
            </p>
            <button
              className="text-button"
              onClick={() => {
                setOrder(null);
                setSelected([]);
                setPerf(null);
                setStep("dates");
                api("/api/production")
                  .then(setProduction)
                  .catch(() => {});
              }}
            >
              Book another performance <ArrowRight size={16} />
            </button>
          </section>
        )}
      </main>
      <footer>
        <span className="wordmark">
          THE VENUE<span className="brand-dot">●</span>
        </span>
        <span>Great performances. Shared.</span>
        <span>THE GRAND HALL · 2026 / 27</span>
      </footer>
      {login && (
        <Login
          onClose={() => setLogin(false)}
          onSuccess={async () => {
            hydrate(await api("/api/me"));
            setLogin(false);
          }}
        />
      )}
    </>
  );
}
function Login({ onClose, onSuccess }) {
  const dialog = useRef(null),
    [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog ref={dialog} onCancel={onClose} aria-labelledby="signin-title">
      <button
        className="modal-close"
        onClick={onClose}
        aria-label="Close sign in"
      >
        <X />
      </button>
      <div className="eyebrow">WELCOME BACK</div>
      <h2 id="signin-title">A familiar face.</h2>
      <p className="muted">Sign in for your saved cards and details.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          const data = new FormData(e.currentTarget);
          try {
            await api("/api/session", {
              method: "POST",
              body: JSON.stringify({
                email: data.get("email"),
                password: data.get("password"),
              }),
            });
            await onSuccess();
          } catch (err) {
            setError(err.message || "Could not sign in. Please try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && (
          <p role="alert" className="login-error">
            {error}
          </p>
        )}
        <label className="field">
          <span>Email address</span>
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Password</span>
          <div className="password-wrap">
            <input
              name="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow(!show)}
            >
              <Eye size={18} />
            </button>
          </div>
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
          <ArrowRight size={18} />
        </button>
      </form>
    </dialog>
  );
}
function TicketCard({ ticket, perf, production }) {
  const barcode = useRef(null);
  useEffect(() => {
    JsBarcode(barcode.current, ticket.barcode, {
      format: "CODE128",
      width: 2,
      height: 70,
      displayValue: true,
      fontSize: 15,
      margin: 12,
    });
  }, [ticket]);
  return (
    <article className="admission-ticket">
      <div className="ticket-top">
        <span className="wordmark">THE VENUE ●</span>
        <span>ADMIT ONE</span>
      </div>
      <div className="ticket-body">
        <div className="eyebrow">{production.hall} · OPERA</div>
        <h2>
          The Marriage
          <br />
          of Figaro
        </h2>
        <div className="ticket-time">
          <b>{date(perf.startsAt)}</b>
          <b>{time(perf.startsAt)}</b>
        </div>
        <p>Doors open {time(perf.doorsAt)}</p>
        <div className="ticket-seat">
          <div>
            <small>SECTION</small>
            <strong>{ticket.section}</strong>
          </div>
          <div>
            <small>ROW</small>
            <strong>{ticket.row}</strong>
          </div>
          <div>
            <small>SEAT</small>
            <strong>{ticket.number}</strong>
          </div>
        </div>
      </div>
      <div className="barcode">
        <svg
          ref={barcode}
          aria-label={`Ticket barcode ${ticket.barcode}`}
          role="img"
        />
      </div>
    </article>
  );
}

createRoot(document.getElementById("root")).render(<App />);
