export type Performance = {
  id: string;
  /** Hall-local time, e.g. "2026-11-13T19:30". */
  startsAt: string;
  doorsAt: string;
  priceFromCents: number;
  seatsLeft: number;
  seats: number;
};

export type Production = {
  title: string;
  hall: string;
  runningTime: string;
  performances: Performance[];
};

export type SeatStatus = "available" | "sold";

export type Seat = { id: string; number: number; status: SeatStatus };
export type Row = { name: string; seats: Seat[] };
export type Section = {
  key: string;
  name: string;
  priceCents: number;
  feeCents: number;
  rows: Row[];
};

export type SeatMap = { performanceId: string; sections: Section[] };

export type CardBrand = "visa" | "mastercard" | "amex" | "discover";
export type Country = "US" | "CA" | "GB";

export type BillingAddress = {
  line1: string;
  line2: string | null;
  city: string;
  postalCode: string;
  country: Country;
};

export type SavedCard = {
  id: string;
  brand: CardBrand;
  last4: string;
  expMonth: number;
  expYear: number;
};

export type SessionUser = { name: string; email: string };

export type Account = SessionUser & {
  billing: BillingAddress | null;
  cards: SavedCard[];
};

export type NewOrder = {
  performanceId: string;
  seatIds: string[];
  email: string;
  payment:
    | { savedCardId: string; cvc: string }
    | {
        card: { number: string; expMonth: number; expYear: number; cvc: string; name: string };
        billing: BillingAddress;
      };
};

export type Ticket = {
  seatId: string;
  section: string;
  row: string;
  number: number;
  barcode: string;
};

export type Order = {
  code: string;
  email: string;
  totalCents: number;
  brand: CardBrand;
  last4: string;
  performanceId: string;
  tickets: Ticket[];
};
