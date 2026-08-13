# Precipitation base maps

Bundled, pre-rendered regional base maps — one per city in the shipped data.
There is no live weather service behind this app: the radar over each map is
DRAWN (`RadarBlobs`) from the city's own precipitation figure, seeded by its
own data, so a dry city shows a clean map and a stormy one is covered — and the
same city always paints the same weather.

All are Wikimedia Commons SVGs. The first four were taken as Commons' own PNG
renderings and graded to one light basemap look:
`ffmpeg -i <in> -vf "format=rgba,colorchannelmixer=rr=0.88:gg=0.90:bb=0.94,eq=contrast=0.85:brightness=0.06" <out>`

The 2026-08-08 batch (uk/fr/de/au/br/in/cn) was rendered from the SVGs in
headless Chrome at 960px wide, recolored to the same look (land `#A0A3AB`,
hairline white boundaries, transparent sea; seas/neighbours/labels hidden),
cropped to content, uniform ~1.15px stroke.

| file | region | source | license |
|---|---|---|---|
| ca.png | California (San Francisco, Los Angeles, San Diego) | [Blank California Map.svg](https://commons.wikimedia.org/wiki/File:Blank_California_Map.svg) | Public domain |
| us.png | United States (Washington, New York, Miami, Chicago, New Orleans) | [Blank US Map (states only).svg](https://commons.wikimedia.org/wiki/File:Blank_US_Map_(states_only).svg) | CC0 |
| it.png | Italy (Venice, Rome) | [Italy map with regions blank.svg](https://commons.wikimedia.org/wiki/File:Italy_map_with_regions_blank.svg) | Public domain |
| jp.png | Japan (Tokyo, Osaka, Sapporo) | [Prefectures of Japan gray.svg](https://commons.wikimedia.org/wiki/File:Prefectures_of_Japan_gray.svg) | CC0 |
| uk.png | United Kingdom (London, Manchester) | [Maps of counties of the United Kingdom BLANK.svg](https://commons.wikimedia.org/wiki/File:Maps_of_counties_of_the_United_Kingdom_BLANK.svg) | CC BY-SA 4.0 |
| fr.png | France (Paris) | [France location map-Regions and departements-2016.svg](https://commons.wikimedia.org/wiki/File:France_location_map-Regions_and_departements-2016.svg) | GFDL / CC BY-SA |
| de.png | Germany (Berlin) | [Germany blank map.svg](https://commons.wikimedia.org/wiki/File:Germany_blank_map.svg) | CC BY-SA 2.0 DE |
| au.png | Australia (Sydney, Melbourne) | [Australia states blank.svg](https://commons.wikimedia.org/wiki/File:Australia_states_blank.svg) | Public domain |
| br.png | Brazil (Rio de Janeiro, São Paulo) | [Brazil Blank Map.svg](https://commons.wikimedia.org/wiki/File:Brazil_Blank_Map.svg) | Public domain |
| in.png | India (Mumbai, Delhi) | [India adm location map.svg](https://commons.wikimedia.org/wiki/File:India_adm_location_map.svg) | CC BY-SA 3.0 |
| cn.png | China (Shanghai, Beijing) | [China adm location map.svg](https://commons.wikimedia.org/wiki/File:China_adm_location_map.svg) | CC BY-SA 3.0 |

Each city carries `px`/`py` — where it sits on its own map, as a fraction of
the plate — so the pin is data, not a hard-coded position.
