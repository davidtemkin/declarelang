import styles from "./Checkout.module.css";

const MARKS: Record<string, string> = {
  visa: "VISA",
  mastercard: "MC",
  amex: "AMEX",
  "american express": "AMEX",
  discover: "DISC",
};

/** A small typographic mark for a card's kind; the name itself is given alongside for assistive technology. */
export function CardBadge({ brand }: { brand: string }) {
  const key = brand.toLowerCase();
  return (
    <span className={styles.badge} data-brand={key} aria-hidden="true">
      {MARKS[key] ?? brand.toUpperCase()}
    </span>
  );
}
