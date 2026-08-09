# Drawn-over art

## moon.png — the lunar disc

- Source: "Full disc of the moon was photographed by the Apollo 17 crewmen",
  NASA, via Wikimedia Commons —
  https://commons.wikimedia.org/wiki/File:Full_disc_of_the_moon_was_photographed_by_the_Apollo_17_crewmen.jpg
- License: **Public domain** (NASA work).
- Processing: cropped square to the limb, scaled to 360px, and cut to a
  transparent circle (`geq` alpha over the disc radius) so nothing outside the
  limb paints. The PHASE is not baked in: `MoonShadow` draws the terminator
  over this disc from the city's own illumination figure.
