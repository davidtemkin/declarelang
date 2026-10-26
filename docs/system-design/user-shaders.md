# User-definable shaders — a view seen through a program's own pixel shader

*2026-10-13. Designed, not built. A program supplies a fragment shader, written in WGSL; a
view names it as its effect; the renderer runs the view's painted subtree through it, on
WebGPU in a browser and on Metal on the Mac. The first case is a CRT (Stargate on a
monitor's glass), prototyped as a one-off over WebGL in the canvas renderer and taken back
out; it now lives outside the repository, and is to be rewritten as the first shader in
this form.*

---

## 1. What it is for

A view's look today is a fixed vocabulary: fill, border, shadow, `filter` (blur,
brightness and the rest, graphics-pass.md §1), `mask`, blend, `scaling`. That covers an
interface. It does not cover a picture that has to be made to look like something physical:
a cathode-ray tube, film grain, a lens, a halftone print, a heat shimmer, a page under
water. Each of those is a small per-pixel program over an image, and every graphics stack
that serves such work lets the author write that program.

The prototype showed what one costs: a pixelated view's layer handed to the GPU, a fragment
shader of about 150 lines (beam profile per colour channel, aperture mask in screen space,
glow, linear light, curved glass, bezel with its reflection, glare), 16.6 ms a frame at
full window on an M2 Max — the frame the game already had. What it lacked was a place in the
language: it was switched on by an address parameter, hard-wired to `pixelated`, and its
parameters were a panel the program could not see.

## 2. Precedents

- **SwiftUI `layerEffect` / `colorEffect` / `distortionEffect`** (iOS 17, macOS 14). A
  Metal function in the app's bundle, named through `ShaderLibrary`; arguments passed as
  typed values (`.float`, `.color`, `.image`); applied as a modifier to any view, with a
  declared `maxSampleOffset` so the system knows how far outside the view the shader reads.
  The closest model: a shader is a resource, its uniforms are ordinary values, any view can
  wear one.
- **Flutter `FragmentProgram`.** One authored shader language in the app's assets,
  compiled at build time to each backend. Shows that one source translated per backend is
  workable at product scale.
- **RetroArch shader presets** (`.slangp`). The CRT field's own format: a chain of passes,
  each a shader file, with parameters declared in the shader (`#pragma parameter`) and
  exposed to the person as sliders. Shows that CRT shaders want several passes and named,
  ranged parameters — and that the parameters belong to the shader, not to the host.
- **Shadertoy.** A fixed input contract (`iResolution`, `iTime`, `iChannel0…`) is what makes
  a fragment shader portable between authors: the shader is written against names the host
  promises.
- **Figma's renderer on WebGPU** (2025, WebGL kept as a fallback). A GPU-drawn product
  moving to the API the web's GPU work now goes into: less CPU per draw through prebuilt
  pipelines, compute shaders, fewer translation layers between the page and the GPU.
- **CSS custom filters** (the abandoned `filter: custom()` of 2012) are the warning: they
  were withdrawn over timing attacks — a shader reading cross-origin pixels can leak them
  through how long it takes. Section 7 says how that is answered here.

## 3. Options

1. **A filter function that takes source text** — `filter = shader("crt.wgsl", { … })`.
   Least new vocabulary, but parameters become an untyped bag, the checker can see nothing,
   and a filter list is the wrong home for a program with its own state.
2. **A `Shader` member and an `effect` attribute** (chosen). A shader is a declared
   member with a source file; its uniforms are its typed attributes, so constraints,
   springs and data drive them like any other value; a view names it with `effect`.
3. **Shaders as a kind of `draw()`** — a drawing command that runs a shader over an image.
   Covers generated images (noise, gradients) but not the main case, which is a view's own
   painted subtree, including text and controls it does not draw itself.

Option 2 is the one specified below. Option 3's case (a shader that makes an image from
nothing) falls out of it: a `Shader` applied to an empty view with a fill.

## 4. The GPU API: WebGPU, not WebGL

The browser side is built on **WebGPU**, and the authored language is its own, **WGSL**.

WebGL is OpenGL ES brought into the browser; it is frozen — supported, never removed, with
no successor version — and the web's GPU work now goes into WebGPU, which is shaped like the
native APIs underneath it (Metal, Direct3D 12, Vulkan). A new form in the language is built
on the API that will be there, not on the one being superseded. What that buys:

- **Pipelines built once.** A shader's pipeline (its compiled program, its bindings, its
  output format) is made when the shader is first used and reused every frame; a frame is a
  recorded pass and one submission, with little per-draw checking.
- **Compute.** Effects that need a reduction or a scatter (a bloom pyramid, an average
  brightness, a histogram) are compute passes, not fragment-shader workarounds (section 10).
- **One fewer translation.** In Safari WebGL runs through ANGLE onto Metal; WebGPU maps onto
  Metal almost directly, and the Mac host speaks Metal itself.
- **Errors.** `getCompilationInfo()` gives each shader message with its line and column,
  which section 8 maps back to the program's own file.

Its reach in October 2026: Chrome and Edge (desktop since 2023, Android since 2024), Safari
26 on macOS and iOS (2025), Firefox on Windows (2025) with other platforms following. Where a
browser has no WebGPU, a view with an effect is drawn without it, and the console says so
once — as for any capability a host lacks. A WebGL 2 fallback (WGSL translated to GLSL ES
3.00 at compile time by the same translators the Mac uses) is held in reserve, built only if
the browsers left without WebGPU turn out to matter.

**Existing shaders in GLSL** — most published CRT and film shaders, Shadertoy, RetroArch —
port to WGSL mechanically; Naga and Tint translate GLSL to WGSL as a one-time step for the
author, after which the WGSL is the source. Porting is the author's step, not the runtime's.

## 5. The form

```declare
tube: Shader [ source = "crt.wgsl",
    sharpness: number = 0.6,
    maskStrength: number = { app.settings.mask },   // a constraint, like any attribute
    curvature: number = 0.08,
    glare: number = 0.15
    ],

screen: View [ scale = { app.unit }, imageSmoothing = pixelated, effect = { app.tube } ]
```

- **`Shader`** is a Node-like member (no box, never drawn itself). `source` names a WGSL
  file, resolved like any address in the program (a path relative to the program that names
  it).
- **Its declared attributes are its uniforms.** The host generates a WGSL struct from them,
  in declaration order, with WGSL's alignment rules applied, and binds it as `params`: the
  shader reads `params.sharpness`. The member is the one place the uniforms are named, so
  a shader cannot disagree with it about what exists or of what type. The mapping: `number`
  → `f32`; `Point`, `Size` → `vec2f`; `Color` → `vec4f` (linear, premultiplied); `boolean`
  → `u32` (1 or 0 — WGSL has no `bool` in a uniform buffer); an enum → `u32`, its tokens in
  declaration order; `Image` → a `texture_2d<f32>` of its own (section 10).
- **`effect`** on any view: `null` (the default) or a `Shader`. One shader may serve
  several views; each runs it over its own layer. A view with an effect is an isolating
  group, as a view with a `filter` is now: its subtree is painted to a layer, then the
  layer is drawn through the shader. `filter`, `mask` and `opacity` apply after the effect,
  in that order.
- **Changing a uniform** rewrites the uniform buffer and repaints only the effect pass, not
  the subtree, unless the subtree also changed. A shader that reads `host.time` asks for a
  frame every display frame while its view is showing; one that does not is idle like any
  other view (idle-zero).

### What the author writes, and the contract

The author writes one function; the host supplies the entry point, the full-view triangle
that runs it, and the bindings:

```wgsl
// crt.wgsl
fn effect(at: vec2f) -> vec4f {
    let px = (at - host.origin) / host.unitScale;             // in the view's units
    let src = textureSampleLevel(layer, nearest, at / host.layerSize, 0.0);
    ...
    return color;                                             // premultiplied
}
```

| name | WGSL type | meaning |
|---|---|---|
| `at` | `vec2f` (argument) | this fragment's centre, in the layer's device pixels |
| `layer` | `texture_2d<f32>` | the view's painted subtree, premultiplied, device pixels |
| `nearest`, `linear` | `sampler` | the two samplers, clamped at the edge |
| `host.layerSize` | `vec2f` | the layer's size in device pixels |
| `host.viewSize` | `vec2f` | the view's size in its own units |
| `host.unitScale` | `f32` | device pixels to one of the view's units (the composed transform's magnitude × density) — so a pixelated source is sampled at its own pixels' centres, as the prototype does |
| `host.origin` | `vec2f` | where the view's (0,0) falls in the layer, device pixels |
| `host.time` | `f32` | seconds since the effect was first shown (reading it makes the effect animate) |
| `params` | generated struct | the member's attributes |

A shader's parameters are written in the view's units, not device pixels (a mask pitch of
0.33 of a source pixel, a bezel of 12 units), with `host.unitScale` converting — the rule
drawing lengths already follow (drawing units, graphics-pass.md).

**Bleed.** A shader may draw outside the view's box (a glow, a bezel). The member says how
far: `bleed: Inset = 24` (in the view's units). The layer is that much larger, and the dirty
region accounts for it; the hit box does not grow — input stays where the view is
(section 10).

## 6. How each host runs it

- **Browser, canvas renderer.** One `GPUDevice` for the program, made when the first effect
  is shown, shared by every effect. Per frame for each effected view: the layer (the 2D
  canvas the view's subtree is painted into today) is copied to a texture with
  `copyExternalImageToTexture`, the pass draws into a WebGPU canvas context that is never in
  the page, and that canvas is drawn into the renderer's 2D canvas with `drawImage` — the
  prototype's path, with WebGPU in place of WebGL. Pipelines are cached per source hash and
  output format; textures are reused while the layer's size holds.
- **Mac.** The WGSL is translated to Metal Shading Language when the program is built for
  the Mac (when it loads, in development) by **Tint**, the WGSL compiler that Chrome's WebGPU
  (Dawn) is built on — a C++ library linked into the host, so the app stays self-contained
  (Naga, wgpu's Rust equivalent, is the alternative). The result is compiled to a Metal
  library and cached by the source's hash. At paint, the view's layer subtree is rendered
  into a Metal texture (`CARenderer` over the sublayer tree) and the fragment function draws
  it into a `CAMetalLayer` that takes the view's place — Metal as the escape hatch
  native-host.md already allows for hot surfaces. The generated bindings are the same on
  both hosts, so `host.*` and `params.*` mean the same.
- **DOM renderer: later.** CSS has no custom fragment shader. The route is to paint the
  view's subtree with the canvas renderer inside its DOM box, or, where a browser offers it,
  to draw the element into a canvas (the HTML-in-canvas proposal) and copy that. Until then
  a view with an effect on the DOM renderer is drawn without it, and the checker says so
  once.
- **Headless and crawl** draw without effects; a screenshot test of an effect runs in a
  browser with WebGPU.

## 7. Safety

A shader sees only its own view's layer, which the program painted. A cross-origin image
painted into that layer without CORS taints it, and WebGPU refuses to copy a tainted canvas
(`copyExternalImageToTexture` throws); the effect is then skipped for that frame and the
console says why. That closes the timing channel that sank CSS custom filters: a shader
never reads pixels the program could not read itself.

## 8. Checking and errors

- **Uniforms** need no check: they are generated from the member (section 5). The member
  may not declare a name the contract uses.
- **Shader compile errors.** WebGPU's `getCompilationInfo()` and Tint both report line and
  column in the wrapped source; the host subtracts the wrapper and reports them as
  `crt.wgsl:42:9: …` with the shader's own text, under one Declare error code — at the
  first frame the effect is shown in a browser, at build on the Mac. `declare-verify` runs
  the same WGSL check headlessly (Tint or Naga as a tool), so a broken shader is caught
  before a browser is opened. A failed shader leaves its view drawn plainly.
- **declare-help / docs**: `Shader`, `View.effect` and the contract table are reference
  pages like any member's.

## 9. Cost and slimming

The module (the device, the wrapper, the pass) ships only in a program that declares a
`Shader` (a capability, `effects`, as `files` is); elsewhere a stand-in answers. Pipelines
are cached per source hash; layers and textures are reused frame to frame at the same size.
The Mac's translator is linked into the host once; the per-program cost is the cached Metal
library.

## 10. Later

- **Several passes.** A CRT is commonly done in passes (a horizontal beam pass, a vertical
  one, a glow at reduced size, a composite). The form: `effect = { [app.beam, app.glow,
  app.tube] }`, each pass's output the next one's `layer`, with an optional `scale` per pass
  and named outputs of earlier passes as extra textures (RetroArch's model). The single-pass
  form is the list of one.
- **Compute passes.** A `Shader` whose source has a compute entry instead of `effect`, run
  between passes over the layer (a brightness average for automatic exposure, a bloom
  pyramid). WebGPU has them; WebGL never would.
- **Feedback.** A shader that reads its own last frame (phosphor persistence) — a
  `history` texture, one frame back.
- **Input through a distortion.** A curved screen moves what is drawn away from where the
  view is; a press on the glass should find what it shows. A `Shader` that distorts would
  supply the inverse mapping as a method (`unmap(p: Point) -> Point`, in the view's units)
  that the hit walk calls — on the CPU, beside the shader rather than in it. Not needed for
  the first case: Stargate takes no pointer input.
- **Images as uniforms beyond the layer** (a mask texture, a lookup table), declared as
  `Image` attributes — in the type mapping above, but not needed for the CRT.

## 11. The first shader

The prototype (`crtPass`, its parameters `sharp`, `beamMin`, `beamMax`, `mask`,
`maskStrength`, `pitch`, `glow`, `gammaIn`, `gammaOut`, `boost`, `vignette`, `radius`,
`dist`, `fill`, `bezel`, `corner`, `reflect`, `glare`) is GLSL ES 3.00 over WebGL. It becomes
`crt.wgsl` beside Stargate, a `Shader` member whose attributes are those parameters, and
`effect = { app.tube }` on Stargate's `screen`. Building that is the test of this design:
the result must look and cost the same as the prototype on the canvas renderer, and the
same on the Mac.
