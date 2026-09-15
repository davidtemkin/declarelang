export default async ({ expect, page }) => {
  const call = (method, ...args) => page.evaluate(({ method, args }) =>
    window.__declare.find("app")[method](...args), { method, args });

  const savedAt = "2026-09-09T19:42:00.000Z";
  const envelope = (overrides = {}, extra = {}) => ({
    schemaVersion: 1,
    modelId: "airline-operating-margin",
    modelRevision: "1",
    workingSourceId: "base",
    overrides,
    savedAt,
    ...extra,
  });

  await expect.attr("app", "schemaVersion", 1);
  await expect.attr("app", "modelId", "airline-operating-margin");
  await expect.attr("app", "modelRevision", "1");
  await expect.attr("app", "storageKey",
    "causal-desk/airline-operating-margin/working-scenario");

  const baseWorking = { assumptions: { demandGrowth: 0.055, jetFuelPrice: 2.7 } };
  const baseBefore = JSON.stringify(baseWorking);
  const baseRecord = await call("buildRecord", baseWorking, "base", savedAt);
  await expect.equal(JSON.stringify(baseRecord.overrides), JSON.stringify({ demandGrowth: 0.055 }),
    "Base builder emits only the changed assumption");
  await expect.equal(JSON.stringify(baseWorking), baseBefore, "builder leaves Base input unchanged");

  const fuelWorking = { assumptions: { demandGrowth: 0.05, jetFuelPrice: 4.25 } };
  const fuelRecord = await call("buildRecord", fuelWorking, "fuelShock", savedAt);
  await expect.equal(JSON.stringify(fuelRecord.overrides), JSON.stringify({ jetFuelPrice: 4.25 }),
    "Fuel Shock builder emits only the source delta");
  const fuelValidation = await call("validateRecord", fuelRecord);
  await expect.equal(fuelValidation.ok, true, "valid record accepted");
  await expect.equal(fuelValidation.code, "valid", "valid record code");
  const restored = await call("restoreRecord", fuelRecord);
  await expect.approx("app", "schemaVersion", 1, 0);
  await expect.equal(JSON.stringify(restored.assumptions),
    JSON.stringify({ demandGrowth: 0.05, jetFuelPrice: 4.25 }),
    "round trip reconstructs source plus overrides");

  const withUnknownEnvelope = envelope({ demandGrowth: 0.04 }, { futureField: "ignored" });
  const canonical = await call("validateRecord", withUnknownEnvelope);
  await expect.equal(canonical.ok, true, "unknown envelope field is ignored");
  await expect.equal(Object.hasOwn(canonical.record, "futureField"), false,
    "accepted record is canonical");
  const mutation = await call("mutationProbe");
  await expect.equal(mutation.workingUnchanged, true, "builder does not mutate its input");
  await expect.equal(mutation.recordUnchanged, true, "validator does not mutate its input");

  const cases = [
    [null, "malformed"],
    [{}, "malformed"],
    [envelope({}, { savedAt: "not-a-date" }), "malformed"],
    [envelope({}, { savedAt: "2026-09-09" }), "malformed"],
    [envelope([], {}), "malformed"],
    [envelope({}, { schemaVersion: 2 }), "unsupported_schema"],
    [envelope({}, { modelId: "another-model" }), "wrong_model"],
    [envelope({}, { modelRevision: "2" }), "stale_revision"],
    [envelope({}, { workingSourceId: "missing" }), "unknown_source"],
    [envelope({ missingFactor: 1 }), "unknown_factor"],
    [envelope({ demandGrowth: 0.04, missingFactor: 1 }), "unknown_factor"],
    [envelope({ baseRevenue: 9000 }), "non_assumption_factor"],
    [envelope({ revenue: 9000 }), "non_assumption_factor"],
    [envelope({ demandGrowth: "0.04" }), "malformed"],
    [envelope({ demandGrowth: -0.1001 }), "out_of_range"],
    [envelope({ demandGrowth: 0.1501 }), "out_of_range"],
  ];
  for (const [record, expectedCode] of cases) {
    const before = record == null ? "null" : JSON.stringify(record);
    const result = await call("validateRecord", record);
    await expect.equal(result.ok, false, `${expectedCode} is rejected`);
    await expect.equal(result.code, expectedCode, `${expectedCode} has stable code`);
    await expect.equal(result.record, null, `${expectedCode} returns no accepted record`);
    const after = record == null ? "null" : JSON.stringify(record);
    await expect.equal(after, before, `${expectedCode} input is unchanged`);
  }

  for (const kind of ["nan", "positive", "negative"]) {
    const result = await call("validateNonFinite", kind);
    await expect.equal(result.ok, false, `${kind} non-finite value is rejected`);
    await expect.equal(result.code, "non_finite_value", `${kind} has stable code`);
    await expect.equal(result.record, null, `${kind} returns no accepted record`);
  }

  for (const [id, value] of [
    ["demandGrowth", -0.1],
    ["demandGrowth", 0.15],
    ["jetFuelPrice", 1.5],
    ["jetFuelPrice", 5],
  ]) {
    const result = await call("validateRecord", envelope({ [id]: value }));
    await expect.equal(result.ok, true, `${id} inclusive boundary ${value} accepted`);
  }
};
