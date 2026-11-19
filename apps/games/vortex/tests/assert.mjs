// The model's rules, called directly on the game's field of play, which is empty
// and still until a game starts:
//   npx declare-verify apps/games/vortex/vortex.declare --assert apps/games/vortex/tests/assert.mjs
// A test of the model's logic, not of play: it calls the field's methods rather
// than pressing anything, so it says the rules are right, not that a player can
// reach them. That is checked by playing.

const flipper = (from, lane) => ({ id: 9, kind: "flipper", lane, from, flipAt: 1, flipFor: 0.25, born: 0, speed: 0.25,
  top: 0, cargo: "flipper", dir: 1, count: 0, next: 0, fireAt: 0 });

export default async ({ drive, expect }) => {
  // where a thing is now is a function of its record and the clock
  expect(await drive.call("app.field", "depthOf", flipper(2, 3), 2)).toBe(0.5);
  expect(await drive.call("app.field", "depthOf", flipper(2, 3), 10)).toBe(1);          // no further than the rim
  expect(await drive.call("app.field", "laneOf", flipper(2, 3), 1.125, true)).toBe(2.5);  // halfway through its flip
  expect(await drive.call("app.field", "laneNow", flipper(2, 3), 1.2)).toBe(3);           // past halfway, it counts as there

  // a closed tube goes the short way round; an open one goes straight across
  expect(await drive.call("app.field", "laneOf", flipper(15, 0), 2, true)).toBe(16);
  expect(await drive.call("app.field", "laneOf", flipper(15, 0), 2, false)).toBe(0);

  // spikes: the shortest lane, and a lane's height with no spiker laying it
  await drive.call("app.field", "standSpikes", 0.4);
  await drive.call("app.field", "set", ["spikes", 5, "h"], 0.1);
  expect(await drive.call("app.field", "shortestSpike")).toBe(5);
  expect(await drive.call("app.field", "spikeIn", 6, 0)).toBe(0.4);

  // a fuseball is worth more the further down the tube it is shot
  expect(await drive.call("app.field", "points", "fuseball", 0.3)).toBe(750);
  expect(await drive.call("app.field", "points", "fuseball", 0.9)).toBe(250);
  expect(await drive.call("app.field", "points", "flipper", 0.5)).toBe(150);

  // reset clears the field; lay puts a wave's nymphs at the far end
  await drive.call("app.field", "reset");
  await expect.attr("app.field", "value", { nymphs: [], foes: [], shots: [], foeShots: [], spikes: [], blasts: [] });
  await drive.call("app.field", "lay", 20);
  expect((await drive.read("app.field.value.nymphs")).length).toBe(20);
};
