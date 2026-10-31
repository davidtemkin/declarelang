import { test } from "node:test";
import assert from "node:assert/strict";
import { validCard, formatCard, validate } from "./validation.js";
test("card formatting and Luhn validation", () => {
  assert.equal(formatCard("378282246310005"), "3782 822463 10005");
  assert.equal(formatCard("4242424242424242"), "4242 4242 4242 4242");
  for (const n of ["4242424242424242", "378282246310005", "4000000000000002"])
    assert.ok(validCard(n));
  assert.ok(!validCard("4242424242424241"));
});
test("new cards validate expiry, postal codes and brand-specific security code", () => {
  const f = {
    email: "a@a.co",
    name: "Ada",
    number: "378282246310005",
    expiry: "04 / 38",
    cvc: "1234",
    line1: "12 Street",
    city: "London",
    postalCode: "WC1N 1AB",
    country: "GB",
  };
  assert.deepEqual(validate(f), {});
  assert.ok(validate({ ...f, cvc: "123" }).cvc);
  assert.ok(validate({ ...f, expiry: "13 / 38" }).expiry);
  assert.ok(validate({ ...f, postalCode: "123" }).postalCode);
  assert.ok(validate({ ...f, expiry: "01 / 20" }).expiry);
  assert.deepEqual(validate({ ...f, cvc: "123" }, "visa"), {});
});
