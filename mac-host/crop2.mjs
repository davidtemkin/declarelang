// crop2 — stack the same region from both renders for eyeball comparison.
//   node mac/crop2.mjs X Y W H out.png     (point coordinates, 2× backing)
import { execFileSync } from "node:child_process";
const [x, y, w, h, out] = process.argv.slice(2).map((v, i) => (i < 4 ? Number(v) : v));
execFileSync("/usr/bin/python3", ["-c", `
from PIL import Image
S = 2
box = (${x}*S, ${y}*S, (${x}+${w})*S, (${y}+${h})*S)
a = Image.open("/tmp/fidelity/native.png").convert("RGB").crop(box)
b = Image.open("/tmp/fidelity/web.png").convert("RGB").crop(box)
out = Image.new("RGB", (a.width, a.height*2 + 10), (255,0,255))
out.paste(a, (0,0)); out.paste(b, (0, a.height + 10))
out.save("${out}")
print("native(top)/web(bottom)", out.size)
`], { stdio: "inherit" });
