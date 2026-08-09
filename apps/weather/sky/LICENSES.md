# Sky backgrounds — sources and licenses

Development assets for `apps/weather` (2026-08-08). Both are Wikimedia Commons
photographs, graded toward the reference look (softer, cooler, calmer) with
the exact ffmpeg commands below, so the grade is reproducible from the
originals. Ruling (David): free sources only; these are dev-phase assets and
may be swapped before anything ships outward. The sunny sky is DRAWN in the
app (gradient + radial glow), not a photograph; condition coverage is bounded
by the shipped datasets.

## cloudy.jpg — overcast

- Source: "Sky Clouds and Atmosphere.jpg", Wikimedia Commons —
  https://commons.wikimedia.org/wiki/File:Sky_Clouds_and_Atmosphere.jpg
- License: **CC0** (public domain dedication — no attribution required;
  recorded anyway).
- Grade: `ffmpeg -i atmo.jpg -vf "gblur=sigma=3,eq=saturation=0.55:brightness=0.04:contrast=0.92,colorchannelmixer=rr=0.94:bb=1.06" cloudy.png` → jpeg q4.

## cumulus.jpg — bright broken clouds

- Source: "White Cumulus Clouds against Blue Sky.jpg", Wikimedia Commons —
  https://commons.wikimedia.org/wiki/File:White_Cumulus_Clouds_against_Blue_Sky.jpg
- License: **CC BY-SA 4.0** — attribution required (see the Commons page for
  the author credit), derivative shared under the same license. Fine for the
  development phase in-repo; REVISIT before any outward distribution of the
  app as a product (swap for a CC0 source or own photography if BY-SA terms
  are unwanted).
- Grade: `ffmpeg -i cumulus1.jpg -vf "gblur=sigma=1.5,eq=saturation=0.85:brightness=0.05:contrast=0.95" cumulus.png` → jpeg q4.
