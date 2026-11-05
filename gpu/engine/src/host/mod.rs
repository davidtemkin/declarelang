//! The host: the runtime's retained-layer tree, drawn through the engine.
//!
//! MacBackend (runtime/src/mac-backend.ts) keeps the scene model, hit testing and the scroll
//! model in JS, and hands its host a retained layer tree as a stream of ops: one commit per
//! frame, geometry as binary records. On the Mac the host is Swift and the layers are Core
//! Animation's; here it is this module. It applies the ops to its own node tree and, when a
//! frame is drawn, walks the tree into the engine's commands. LayerTree.swift is the
//! reference for what each op means.
//!
//! What it needs from its platform it asks for between calls, never during one (the platform
//! may call back into the engine): the lines of a changed Text (`text_wanted`, answered by
//! `text_answer`), a 3D view's projection (`three`, answered by `set_projection`), an image's
//! size. What it tells its platform it queues: the page's work (`take_shell`), the scroll
//! facts the runtime hears (`take_facts`), and whether a frame, a tick or a sharpening pass is
//! wanted (`wants`).
//!
//! - mod.rs: the tree, the ops, the census and the platform's queues.
//! - walk.rs: the paint walk — boxes, text, images, effects (filters, frost, 3D).
//! - scroll.rs: the scroll process (wheel, bars, glides, touch) and scroll layers (tiles).
//! - frame.rs: a frame — the damage, the fast path, presenting.

mod frame;
pub(crate) mod geom;
mod scroll;
mod walk;

use std::collections::{HashMap, HashSet};
use std::hash::{BuildHasherDefault, Hasher};

use serde_json::{json, Value};

use crate::Engine;
use geom::*;
use walk::Commands;

/// A hasher for small integer keys (node ids).
#[derive(Default)]
pub(crate) struct IdHasher(u64);
impl Hasher for IdHasher {
    fn finish(&self) -> u64 { self.0 }
    fn write(&mut self, bytes: &[u8]) { for b in bytes { self.0 = (self.0.rotate_left(5) ^ *b as u64).wrapping_mul(0x51_7c_c1_b7_27_22_0a_95); } }
    fn write_u32(&mut self, i: u32) { self.0 = (i as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15); }
    fn write_i64(&mut self, i: i64) { self.0 = (self.0.rotate_left(29) ^ i as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15); }
}
pub(crate) type Map<V> = HashMap<u32, V, BuildHasherDefault<IdHasher>>;
pub(crate) type Set = HashSet<u32, BuildHasherDefault<IdHasher>>;

/// A view's blend token (backend.ts setBlend) → the engine's blend number (lib.rs push_blend).
fn blend_of(s: &str) -> f64 {
    match s {
        "normal" => 0.0, "multiply" => 1.0, "screen" => 2.0, "overlay" => 3.0, "darken" => 4.0, "lighten" => 5.0,
        "colorDodge" => 6.0, "colorBurn" => 7.0, "hardLight" => 8.0, "softLight" => 9.0, "difference" => 10.0,
        "exclusion" => 11.0, "hue" => 12.0, "saturation" => 13.0, "color" => 14.0, "luminosity" => 15.0, "plusLighter" => 29.0,
        _ => 0.0,
    }
}

pub(crate) mod op {
    pub const CREATE: u32 = 1; pub const DESTROY: u32 = 2; pub const INSERT: u32 = 3; pub const ROOT: u32 = 4;
    pub const GEOM: u32 = 5; pub const FILL: u32 = 6; pub const GRADIENT: u32 = 7; pub const RADIUS: u32 = 8;
    pub const STROKE: u32 = 9; pub const SHADOW: u32 = 10; pub const VISIBLE: u32 = 11; pub const OPACITY: u32 = 12;
    pub const SCALE: u32 = 13; pub const CLIP: u32 = 14; pub const BOXCLIP: u32 = 15; pub const TEXT: u32 = 16;
    pub const TEXTSTYLE: u32 = 17; pub const DRAW: u32 = 18; pub const IMAGE: u32 = 19; pub const STRETCH: u32 = 20;
    pub const SCROLL: u32 = 21; pub const SCROLLPOS: u32 = 22; pub const CURSOR: u32 = 23; pub const EDIT: u32 = 24;
    pub const EDITFOCUS: u32 = 25; pub const RICH: u32 = 26; pub const RICHSCROLL: u32 = 27; pub const EMBED: u32 = 28;
    pub const IGNORECLIP: u32 = 29; pub const SCROLLX: u32 = 30; pub const SCROLLXPOS: u32 = 31; pub const PAGEFILL: u32 = 32;
    pub const IGNORESCROLL: u32 = 33; pub const RICHWIDTH: u32 = 34; pub const BLEND: u32 = 35; pub const BACKDROP: u32 = 36;
    pub const TINT: u32 = 37; pub const ROTATE: u32 = 38; pub const MEDIA: u32 = 39; pub const EDITSEL: u32 = 41;
    pub const WHEELCLAIM: u32 = 42; pub const SCROLLGLIDE: u32 = 43; pub const FILTER: u32 = 44; pub const MASK: u32 = 45;
    pub const TRANSFORM: u32 = 46; pub const IMAGEALIGN: u32 = 47; pub const TRANSFORM3D: u32 = 48; pub const PERSPECTIVE: u32 = 49;
    pub const SCALING: u32 = 50; pub const EDITAPPLY: u32 = 51;
}

/// Kinds of change, as census bits.
mod ch {
    pub const MOVE: u32 = 1; pub const SIZE: u32 = 2; pub const XFORM: u32 = 4; pub const ALPHA: u32 = 8; pub const PAINT: u32 = 16;
    pub const TEXT: u32 = 32; pub const DRAW: u32 = 64; pub const IMAGE: u32 = 128; pub const TREE: u32 = 256; pub const SCROLL: u32 = 512;
}
/// What painting did, for the timing rig, by these names.
pub(crate) mod ct {
    pub const VISITED: usize = 0; pub const DRAWN: usize = 1; pub const CULLED_OWN: usize = 2; pub const CULLED_SUBTREE: usize = 3;
    pub const FAST: usize = 4; pub const PATCHES: usize = 5; pub const TILES: usize = 6; pub const SNAPSHOTS: usize = 7; pub const FROSTS: usize = 8;
    pub const WALK_HITS: usize = 9; pub const WALK_KEPT: usize = 10; pub const WALK_HIT_VIEWS: usize = 11; pub const FILTERS_KEPT: usize = 12; pub const WALK_MOVED: usize = 13; pub const MOTION_LAYERS: usize = 14;
    pub const NAMES: [&str; 15] = ["visited", "drawn", "culledOwn", "culledSubtree", "fast", "patches", "tiles", "snapshots", "frosts",
        "walkHits", "walkKept", "walkHitViews", "filtersKept", "walkMoved", "motionLayers"];
}
/// Placement: changes that move a view's pixels without changing them.
const PLACEMENT: u32 = ch::MOVE | ch::XFORM | ch::ALPHA;
fn kind_of(code: u32) -> Option<u32> {
    use op::*;
    Some(match code {
        SCALE | ROTATE | TRANSFORM | TRANSFORM3D | PERSPECTIVE => ch::XFORM,
        OPACITY => ch::ALPHA,
        FILL | GRADIENT | RADIUS | STROKE | SHADOW | TINT | BLEND | FILTER | MASK | BACKDROP | CLIP | BOXCLIP => ch::PAINT,
        TEXT | TEXTSTYLE | RICH | RICHWIDTH => ch::TEXT,
        DRAW => ch::DRAW,
        IMAGE | MEDIA | STRETCH | IMAGEALIGN => ch::IMAGE,
        CREATE | DESTROY | INSERT | VISIBLE => ch::TREE,
        SCROLLPOS | SCROLLXPOS => ch::SCROLL,
        _ => return None,
    })
}
/// Ops that can change whether a scroller's content can be kept as a layer (keepable).
fn keep_op(code: u32) -> bool {
    use op::*;
    matches!(code, CREATE | DESTROY | INSERT | SCROLL | SCROLLX | BLEND | MASK | IMAGE | FILTER | BACKDROP | TRANSFORM3D | IGNORECLIP | IGNORESCROLL | MEDIA)
}
/// Ops that only move a scroller's content or touch nothing drawn.
fn scroll_only(code: u32) -> bool {
    use op::*;
    matches!(code, SCROLLPOS | SCROLLXPOS | SCROLLGLIDE | WHEELCLAIM | CURSOR | EDITFOCUS | EDITSEL | EDITAPPLY)
}
/// Ops that change nothing drawn: what only the page acts on, and bookkeeping.
fn undrawn(code: u32) -> bool {
    use op::*;
    matches!(code, CREATE | CURSOR | EDITFOCUS | EDITSEL | EDITAPPLY | WHEELCLAIM | EMBED | RICHSCROLL | SCROLLGLIDE)
}

/// The engine image key of a video's frames (media.ts MEDIA_KEY).
pub(crate) const MEDIA_KEY: u32 = 0x7000_0000;
/// The engine image key of a drawing rastered on the worker (drawing.ts RASTER_BASE).
const RASTER_BASE: u32 = 0x4000_0000;

/// A Text's style, as TEXTSTYLE sends it: what drawing it needs; the rest the platform lays out from.
#[derive(Clone, Debug)]
pub(crate) struct Style {
    /// The wire's object as JSON, for the platform's layout, and its number there (Host::styles).
    pub raw: String,
    pub sid: u32,
    pub color: Option<String>,
    pub fill_gradient: Option<(f64, Vec<(Option<f64>, String)>)>,
    pub align: String,
    pub pad: [f64; 4],
    pub shadow: Option<(f64, f64, f64, String)>,
    pub outline: Option<(f64, String)>,
    pub underline: bool,
    pub strike: bool,
}
fn style_of(v: &Value, raw: &str) -> Style {
    let pad = v.get("pad").and_then(Value::as_array).map(|p| [0, 1, 2, 3].map(|i| p.get(i).and_then(Value::as_f64).unwrap_or(0.0))).unwrap_or([0.0; 4]);
    let fill_gradient = v.get("fillGradient").filter(|g| !g.is_null()).map(|g| (field(g, "angle").unwrap_or(0.0), wire_stops(g.get("stops"))));
    let shadow = v.get("shadow").and_then(Value::as_array).map(|s| (jnum(s.first()), jnum(s.get(1)), jnum(s.get(2)), s.get(3).map(jstr).unwrap_or_default()));
    let outline = v.get("outline").filter(|o| o.is_object()).map(|o| (field(o, "width").unwrap_or(0.0), o.get("color").map(jstr).unwrap_or_default()));
    Style {
        raw: raw.to_string(), sid: 0,
        color: v.get("color").and_then(Value::as_str).map(str::to_string),
        fill_gradient,
        align: v.get("align").and_then(Value::as_str).unwrap_or("left").to_string(),
        pad, shadow, outline,
        underline: v.get("underline") == Some(&Value::Bool(true)),
        strike: v.get("strike") == Some(&Value::Bool(true)),
    }
}

/// How a Text's style is laid out, as the platform measured it.
#[derive(Clone, Debug)]
pub(crate) struct TextLayout { pub families: String, pub size: f64, pub weight: f64, pub italic: bool, pub ls: f64, pub ascent: f64, pub line_height: f64, pub half_lead: f64 }

#[derive(Clone, Debug)]
pub(crate) struct Glide { pub y: bool, pub from: f64, pub to: f64, pub start: f64, pub ms: f64, pub b: [f64; 4], pub wheel: bool }

/// A scroller's cached content: tiles of W×H device pixels over its content, at scale k.
pub(crate) struct ScrollLayer {
    pub k: f64, pub w: f64, pub h: f64,
    /// Where the scroller sits within a device pixel: its tiles are drawn at that phase, so
    /// laying them on whole pixels moves nothing (only the scroll offset is rounded).
    pub fx: f64, pub fy: f64,
    /// By (tx, ty): the tile's engine id, whether it is drawn, and the part of it to draw
    /// again in its own pixels (a hover inside the content redraws that much, not the tile).
    pub tiles: HashMap<(i64, i64), Tile, BuildHasherDefault<IdHasher>>,
    /// Its content holds nothing a layer cannot keep (frost, filters, 3D, masks, blends, video).
    pub eligible: bool,
    /// When a layer that cannot be was last found so (keep_gen).
    pub checked: i64,
    /// Painted through it last frame.
    pub used: bool,
    /// What lies under and over it in the frame's region, kept by the frame that scrolled it,
    /// with what that frame placed it by: a frame that only scrolls it lays these and its tiles.
    pub cache: Option<LayerCache>,
}
pub(crate) struct Tile { pub id: u32, pub ok: bool, pub dirty: Option<Rect> }
#[derive(Clone)]
pub(crate) struct LayerCache { pub region: Rect, pub below: u32, pub above: u32, pub m: M, pub within: Rect, pub pixelated: bool }

#[derive(Clone, Debug)]
pub(crate) enum Mask { Gradient(Gradient), View { stencil: u32, x: f64, y: f64 } }

pub(crate) struct Node {
    pub id: u32,
    pub parent: Option<u32>,
    pub children: Vec<u32>,
    pub x: f64, pub y: f64, pub w: f64, pub h: f64,
    pub fill: Option<u32>,
    pub gradient: Option<Gradient>,
    pub radii: Vec<f64>,
    pub stroke: Option<(f64, u32)>,
    pub sides: Option<[Option<(f64, u32)>; 4]>,
    pub shadow: Option<(f64, f64, f64, u32)>,
    pub visible: bool,
    pub opacity: f64,
    pub scale: f64, pub pivot_x: f64, pub pivot_y: f64, pub rotation: f64,
    pub affine: Option<M>,
    pub box_clip: bool,
    pub ignore_clip: bool,
    pub scroll_y: f64, pub scroll_x: f64,
    /// A scroller on y / x: the host's scroll process moves it.
    pub scrolls: bool, pub scrolls_x: bool,
    /// Its content's extent, as the runtime last published it.
    pub ext_y: f64, pub ext_x: f64,
    /// Pinned to its scroller's frame.
    pub ignore_scroll: bool,
    /// An onWheel claimant.
    pub wants_wheel: bool,
    /// A wheel stream is moving it.
    pub scrolling_live: bool,
    /// A wheel's quiet timer is running (the platform's; `quiet` ends it).
    pub quiet: bool,
    /// Its overlay bar is widened (pointer near, or held); its bar's thumb is held.
    pub bar_wide: bool, pub bar_held: bool,
    /// When the pane last moved (its bars show from then, scroll.rs bar_alpha), whether a
    /// finger moved it (iOS's indicator then), and how much of its bars the last frame drew.
    pub bar_seen: f64, pub bar_touch: bool, pub bar_drawn: f64,
    /// A touch's rubber band: the offset shown, past the range.
    pub vis_y: Option<f64>, pub vis_x: Option<f64>,
    pub glide: Vec<Glide>,
    pub text: String,
    pub style: Option<Style>,
    pub layout: Option<TextLayout>,
    pub lines: Option<Vec<String>>,
    /// The width its lines were laid out for (-1: none).
    pub lines_for: f64,
    /// A DOM field is over this node and draws its text (the page shows one only while the
    /// field has focus).
    pub editing: bool,
    /// An editable field (EDIT): 1 one line, 2 several; its text is the field's value or
    /// placeholder, drawn here while no DOM field shows it.
    pub field: u8,
    /// The engine holds this node's drawing, as picture `id`.
    pub picture: bool,
    /// The decoded bitmap it shows, by handle.
    pub image: Option<u32>,
    pub stretch: String,
    pub align_x: String, pub align_y: String,
    pub tint: u32,
    pub pixelated: bool,
    pub blend: f64,
    /// A shape clip is set in the engine (set_shape, by id).
    pub shaped: bool,
    pub mask: Option<Mask>,
    /// The filter tier: its painted subtree through a layer.
    pub filters: Option<Vec<WireFilter>>,
    /// Frost: what is beneath it, filtered, under its box.
    pub backdrop: Option<Vec<WireFilter>>,
    /// Out of its plane; `projection` is its homography and whether its back hides, from the
    /// platform (None: drawn flat).
    pub three: bool,
    pub projection: Option<(H, bool)>,
    /// The device rect its layer or backdrop last covered.
    pub fx_rect: Option<Rect>,
    /// A scroller drawn as a layer: its content in tiles kept between frames. Its descendants'
    /// `painted` are then in the layer's content-device space, not the screen's.
    pub layer: Option<ScrollLayer>,
    /// The scroll position its last frame drew, and when it last moved.
    pub seen_x: f64, pub seen_y: f64, pub scrolled_at: f64,
    /// The drawing's reach: x y w h pad.
    pub pic_bounds: Option<[f64; 5]>,
    /// How far the laid-out text reaches.
    pub text_extent: Option<(f64, f64)>,
    /// The device area its subtree covered when last painted.
    pub painted: Option<Rect>,
    /// The engine's shaped lines (engine.line), one per line, and the generation they belong to.
    pub handles: Option<Vec<u32>>,
    pub handles_gen: i64,
    /// Each line's x, aligned.
    pub line_x: Vec<f64>,
    pub text_color: u32,
    pub text_stops: Option<Vec<f64>>,
    /// What its text shadow's layer was made from.
    pub shadow_key: Option<u64>,
    /// Bumped whenever it or anything under it changes (Host::bump): its kept walk and plan
    /// hold while it stands.
    pub sub_gen: u64,
    /// Bumped whenever it changes, but for its own opacity: with its children's `sub_gen`, what
    /// its opacity group's kept texture holds while it stands (walk.rs, paint.rs KeptGroup).
    pub own_gen: u64,
    /// What its filter layer was made under: its subtree's generation, its transform, the
    /// device rect made, the engine's text generation, whether pixelated (walk.rs paint_filtered).
    pub filter_made: Option<(u64, M, Rect, u32, bool)>,
    /// Frames in a row its kept walk was laid moved (walk.rs): two or more, it is a moving layer.
    pub moving: u32,
    /// What its subtree's walk wrote last, kept while nothing in it changed (walk.rs).
    pub kept: Option<Box<walk::KeptWalk>>,
}

impl Node {
    fn new(id: u32) -> Node {
        Node {
            id, parent: None, children: Vec::new(), x: 0.0, y: 0.0, w: 0.0, h: 0.0, fill: None, gradient: None, radii: vec![0.0],
            stroke: None, sides: None, shadow: None, visible: true, opacity: 1.0, scale: 1.0, pivot_x: 0.0, pivot_y: 0.0,
            rotation: 0.0, affine: None, box_clip: false, ignore_clip: false, scroll_y: 0.0, scroll_x: 0.0, scrolls: false,
            scrolls_x: false, ext_y: 0.0, ext_x: 0.0, ignore_scroll: false, wants_wheel: false, scrolling_live: false, quiet: false,
            bar_wide: false, bar_held: false, bar_seen: f64::NEG_INFINITY, bar_touch: false, bar_drawn: 0.0, vis_y: None, vis_x: None, glide: Vec::new(), text: String::new(), style: None,
            layout: None, lines: None, lines_for: -1.0, editing: false, field: 0, picture: false, image: None, stretch: "none".into(),
            align_x: "center".into(), align_y: "center".into(), tint: 0, pixelated: false, blend: 0.0, shaped: false, mask: None,
            filters: None, backdrop: None, three: false, projection: None, fx_rect: None, layer: None, seen_x: 0.0, seen_y: 0.0,
            scrolled_at: f64::NEG_INFINITY, pic_bounds: None, text_extent: None, painted: None, handles: None, handles_gen: -1,
            line_x: Vec::new(), text_color: 0, text_stops: None, shadow_key: None, sub_gen: 0, own_gen: 0, filter_made: None, moving: 0, kept: None,
        }
    }
    /// The four corner radii.
    pub(crate) fn r4(&self) -> [f64; 4] {
        let r = &self.radii;
        let r0 = r[0];
        if r.len() == 4 { [r0, r[1], r[2], r[3]] } else { [r0; 4] }
    }
    /// Has text to draw itself.
    pub(crate) fn shows_text(&self) -> bool { !self.text.is_empty() && self.style.is_some() && !self.editing }
}

/// Switches for A/Bs and diagnostics (the worker's URL parameters).
#[derive(Clone, Copy)]
pub(crate) struct Flags { pub cull: bool, pub damage: bool, pub layers: bool, pub census: bool, pub nosharpen: bool, pub nofrost: bool, pub imgq: f64, pub noclip: bool }

/// One frame's census: changed views per kind, then how the changes group.
pub(crate) struct CensusRecord { changed: usize, kinds: [u32; 10], place_only: u32, rigid: u32, rigid_views: u32, affected: usize, visited: f64, drawn: f64, path: &'static str }

/// A frame's timing record: id, start, encode ms, when the GPU finished it, input to submit.
struct Timing { id: u32, start: f64, encode: f64, done: f64, input_to_submit: f64 }

/// What a frame asks of the platform after the call that made it.
#[derive(Default, Clone, Copy)]
pub(crate) struct Wants { pub tick: bool, pub sharpen: bool }

pub(crate) struct Host {
    pub(crate) nodes: Map<Node>,
    root: Option<u32>,
    page: Option<u32>,
    pub(crate) dirty: bool,
    edits: Vec<u32>,
    /// The page scrolls the window for the root (shell.ts): the browser moves it, the page
    /// sends the offset (page_scroll), and requests to scroll the root go to the page.
    pub(crate) page_native: bool,
    /// Views that take a finger (a touch, or a drag that is not a hold), from the runtime.
    pub(crate) touch_claims: Set,
    /// The page map last sent (place_page).
    page_map: String,
    pub(crate) dpr: f64,
    pub(crate) width: f64, pub(crate) height: f64,
    frames: u32,
    frame_log: Vec<f64>,
    timing: Vec<Timing>,
    by_id: HashMap<u32, usize>,
    pub(crate) pending_input: Option<f64>,
    time_origin: f64,
    kinds: Map<u32>,
    sampled_count: usize,
    census: Vec<CensusRecord>,
    counts: [f64; ct::NAMES.len()],
    op_counts: HashMap<u32, f64>,
    image_sizes: Map<(f64, f64)>,
    pub(crate) flags: Flags,

    // ── damage: what the next frame must redraw ──
    /// Nodes whose drawing changed since the last frame (in the order they changed).
    changed: Vec<u32>,
    changed_set: Set,
    /// Areas that were drawn and no longer are (a view removed or moved away).
    lost: Vec<Rect>,
    /// The next frame redraws everything (first frame, resize, a new root, the page's colour).
    full_next: bool,
    damage_counts: [f64; 4],

    /// The frame's commands, written by the paint walk and run by the engine.
    cmd: Commands,
    /// What the runtime hears of the scroll process: nodes, in the order they moved.
    facts: Vec<u32>,
    gliding: Vec<u32>,
    /// Views with a mask: a stencil's change shows through another view, so frames with any are whole.
    masked: Set,
    /// Views changed this frame by anything but a scroll.
    touched: Set,
    /// The layer this frame is only about, if any.
    only: Option<u32>,
    /// Keeping the region over that layer: no pass may cut between its tiles and the end.
    above_for: Option<u32>,
    cuts_after: u32,
    /// Layers' scrollbars, drawn over the frame at its end.
    bars: Vec<(u32, M, Rect)>,
    /// Views drawn through layers (filter, frost, 3D): while any is on screen a frame is whole.
    effects: Vec<u32>,
    /// Moving layers laid this frame (walk.rs): drawn again exactly the frame after.
    soft: Vec<u32>,
    /// The frame's shared backdrop: its scale, and the rects drawn since it was taken.
    snap: Option<f64>,
    since_snap: Vec<Rect>,
    frame_clip: Rect,
    snap_scale: f64,
    /// Whether the commands being written are the frame's own (not a layer's, a tile's).
    in_frame_cmd: bool,
    passes: u32,
    /// The view whose layer is being made, and the 3D view being drawn flat.
    in_layer: Option<u32>,
    in_flat: Option<u32>,
    layer_ids: u32,
    in_layer_tile: u32,
    keep_gen: i64,
    /// DOMIslands and editable fields, with the box last sent to the page.
    islands: Vec<(u32, String)>,
    edit_boxes: HashMap<u32, String>,
    bar_hover: Option<u32>,
    /// A bar being dragged: the pane, its transform, where on the thumb it was taken, its axis.
    bar_drag: Option<(u32, M, f64, bool)>,
    /// A finger down on a showing indicator, not yet held long enough to take it: the pane,
    /// its transform, the axis, when, where (page), and where along the bar.
    bar_press: Option<(u32, M, bool, f64, f64, f64, f64)>,
    /// Panes whose bars are showing or fading.
    fading: Vec<u32>,
    /// Text nodes whose lines may be out of date.
    text_stale: Set,
    /// Text styles by number: each style's JSON is sent to the platform once (text_wanted),
    /// which answers its layout once (text_answer) until the fonts change.
    style_ids: HashMap<String, u32>,
    style_raws: Vec<String>,
    styles_sent: usize,
    style_layouts: Vec<Option<TextLayout>>,
    /// Drawings' reach for views not made yet: a flush's drawings are made before its ops.
    pic_early: HashMap<u32, Option<[f64; 5]>>,
    /// What the page must do: [kind, …] rows (take_shell).
    shell: Vec<Value>,
    pub(crate) wants: Wants,
    unknown: HashSet<u32>,
    /// Subtrees' generations come from this counter (bump).
    gens: u64,
    /// Keep unchanged subtrees' walks and plans (`&nokeep` turns it off, for an A/B).
    pub(crate) keep: bool,
    /// The kept walks being recorded, innermost last (walk.rs).
    pub(crate) walk_rec: Vec<walk::WalkRec>,
}

impl Host {
    pub(crate) fn new(flags: Flags) -> Host {
        Host {
            nodes: Map::default(), root: None, page: None, dirty: false, edits: Vec::new(), dpr: 1.0, width: 0.0, height: 0.0,
            frames: 0, frame_log: Vec::new(), timing: Vec::new(), by_id: HashMap::new(), pending_input: None, time_origin: 0.0,
            kinds: Map::default(), sampled_count: 0, census: Vec::new(), counts: [0.0; ct::NAMES.len()], op_counts: HashMap::new(),
            image_sizes: Map::default(), flags, changed: Vec::new(), changed_set: Set::default(), lost: Vec::new(), full_next: true,
            damage_counts: [0.0; 4], cmd: Commands::default(), facts: Vec::new(), gliding: Vec::new(), masked: Set::default(),
            touched: Set::default(), only: None, above_for: None, cuts_after: 0, bars: Vec::new(), effects: Vec::new(), soft: Vec::new(),
            snap: None, since_snap: Vec::new(), frame_clip: EMPTY, snap_scale: 0.0, in_frame_cmd: false, passes: 0,
            in_layer: None, in_flat: None, layer_ids: 0x5000_0000, in_layer_tile: 0, keep_gen: 0, islands: Vec::new(),
            edit_boxes: HashMap::new(), page_native: false, touch_claims: Set::default(), page_map: String::new(), bar_hover: None, bar_drag: None, bar_press: None, fading: Vec::new(), text_stale: Set::default(), style_ids: HashMap::new(), style_raws: Vec::new(), styles_sent: 0, style_layouts: Vec::new(), pic_early: HashMap::new(), shell: Vec::new(),
            wants: Wants::default(), unknown: HashSet::new(), gens: 0, keep: true, walk_rec: Vec::new(),
        }
    }

    pub(crate) fn nd(&self, id: u32) -> &Node { &self.nodes[&id] }
    pub(crate) fn nm(&mut self, id: u32) -> &mut Node { self.nodes.get_mut(&id).unwrap() }
    fn count(&mut self, k: usize) { self.counts[k] += 1.0; }
    pub(crate) fn set_time_origin(&mut self, t: f64) { self.time_origin = t; }

    pub(crate) fn change(&mut self, id: u32) { self.bump(id); if self.changed_set.insert(id) { self.changed.push(id); } }
    /// Something in `id`'s subtree changed: it and its ancestors' kept walks and plans lapse.
    pub(crate) fn bump(&mut self, id: u32) {
        self.bump_under(id);
        let g = self.gens;
        if let Some(n) = self.nodes.get_mut(&id) { n.own_gen = g; }
    }
    /// Bump the generations of `id`'s subtree and its ancestors', not its own (its opacity
    /// changed: what it draws is the same).
    fn bump_under(&mut self, id: u32) {
        self.gens += 1;
        let g = self.gens;
        let mut k = Some(id);
        while let Some(i) = k {
            let Some(n) = self.nodes.get_mut(&i) else { break };
            n.sub_gen = g;
            k = n.parent;
        }
    }
    fn fact(&mut self, id: u32) { if !self.facts.contains(&id) { self.facts.push(id); } }
    fn moved(&mut self, id: u32) { self.change(id); self.dirty = true; self.fact(id); self.bar_shows(id, false); }

    // ── the platform's queues ──────────────────────────────────────────────────

    /// The scroll facts since the last call: rows of [id, y | null, x | null, scrolling,
    /// gesture, bar held] (macScrollFacts), as JSON; "" when none.
    pub(crate) fn take_facts(&mut self) -> String {
        if self.facts.is_empty() { return String::new(); }
        let rows: Vec<Value> = std::mem::take(&mut self.facts).into_iter().filter_map(|id| self.nodes.get(&id)).map(|n| json!([
            n.id, if n.scrolls { json!(n.scroll_y) } else { Value::Null }, if n.scrolls_x { json!(n.scroll_x) } else { Value::Null },
            if n.scrolling_live || n.bar_held { 1 } else { 0 }, 0, if n.bar_held { 1 } else { 0 }])).collect();
        Value::Array(rows).to_string()
    }
    pub(crate) fn has_facts(&self) -> bool { !self.facts.is_empty() }
    /// What the page must do since the last call, as a JSON array of rows; "" when nothing.
    pub(crate) fn take_shell(&mut self) -> String {
        if self.shell.is_empty() { return String::new(); }
        Value::Array(std::mem::take(&mut self.shell)).to_string()
    }

    // ── the platform's answers ─────────────────────────────────────────────────

    /// A text style's number.
    fn style_id(&mut self, raw: &str) -> u32 {
        if let Some(&k) = self.style_ids.get(raw) { return k; }
        let k = self.style_raws.len() as u32;
        self.style_ids.insert(raw.to_string(), k);
        self.style_raws.push(raw.to_string());
        k
    }

    /// The Texts whose lines are out of date, as JSON: {"s": [[style, its JSON]] for styles not
    /// sent before, "r": [[id, width, style, text]]}. The platform lays them out (the runtime's
    /// own wrapping) and answers with `text_answer`.
    pub(crate) fn text_wanted(&mut self) -> String {
        if self.text_stale.is_empty() { return String::new(); }
        let mut rows = String::new();
        let mut ids: Vec<u32> = self.text_stale.drain().collect();
        ids.sort_unstable();
        for id in ids {
            let Some(n) = self.nodes.get(&id) else { continue };
            if !n.shows_text() { continue; }
            let st = n.style.as_ref().unwrap();
            let tw = n.w - st.pad[3] - st.pad[1];
            if n.lines.is_some() && n.lines_for == tw && n.layout.is_some() { continue; }
            if !rows.is_empty() { rows.push(','); }
            rows.push_str(&format!("[{id},{},{},{}]", json!(tw), st.sid, Value::String(n.text.clone())));
        }
        if rows.is_empty() { return String::new(); }
        let mut styles = String::new();
        for k in self.styles_sent..self.style_raws.len() {
            if !styles.is_empty() { styles.push(','); }
            styles.push_str(&format!("[{k},{}]", self.style_raws[k]));
        }
        self.styles_sent = self.style_raws.len();
        format!("{{\"s\":[{styles}],\"r\":[{rows}]}}")
    }
    /// The layouts of styles not answered before, and the lines of the Texts asked for:
    /// {"l": [[style, families, size, weight, italic, letterSpacing, ascent, lineHeight,
    /// halfLead]], "r": [[id, width, extentW, extentH, [lines]]]}.
    pub(crate) fn text_answer(&mut self, json: &str) {
        let Ok(v) = serde_json::from_str::<Value>(json) else { return };
        for r in v.get("l").and_then(Value::as_array).into_iter().flatten() {
            let k = jnum(r.get(0)) as usize;
            if self.style_layouts.len() <= k { self.style_layouts.resize(k + 1, None); }
            self.style_layouts[k] = Some(TextLayout {
                families: r.get(1).and_then(Value::as_str).unwrap_or("").to_string(), size: jnum(r.get(2)), weight: jnum(r.get(3)),
                italic: r.get(4) == Some(&Value::Bool(true)), ls: jnum(r.get(5)), ascent: jnum(r.get(6)), line_height: jnum(r.get(7)),
                half_lead: jnum(r.get(8)),
            });
        }
        for r in v.get("r").and_then(Value::as_array).into_iter().flatten() {
            let id = jnum(r.get(0)) as u32;
            let Some(n) = self.nodes.get_mut(&id) else { continue };
            let Some(st) = n.style.as_ref() else { continue };
            n.layout = self.style_layouts.get(st.sid as usize).cloned().flatten();
            n.text_extent = Some((jnum(r.get(2)), jnum(r.get(3))));
            n.lines = Some(r.get(4).and_then(Value::as_array).map(|a| a.iter().map(jstr).collect()).unwrap_or_default());
            n.lines_for = jnum(r.get(1));
            n.handles = None;
        }
    }
    /// The 3D views, whose projection the platform supplies before a frame.
    pub(crate) fn three(&self) -> Vec<u32> {
        let mut v: Vec<u32> = self.nodes.values().filter(|n| n.three).map(|n| n.id).collect();
        v.sort_unstable();
        v
    }
    /// A 3D view's homography (9) and whether its back hides (10th, 1/0); empty: drawn flat.
    pub(crate) fn set_projection(&mut self, id: u32, h: &[f64]) {
        let Some(n) = self.nodes.get_mut(&id) else { return };
        let p = if h.len() >= 10 { Some(([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], h[8]], h[9] != 0.0)) } else { None };
        if n.projection == p { return; }
        n.projection = p;
        // drawn otherwise now: what was kept of it lapses, and it is drawn again
        self.change(id);
        self.dirty = true;
    }
    /// A bitmap's natural size (decoded, or a video's frame).
    pub(crate) fn image_size(&mut self, handle: u32, w: f64, h: f64) { self.image_sizes.insert(handle, (w, h)); }
    /// A bitmap finished decoding: the views showing it redraw.
    pub(crate) fn image_landed(&mut self, handle: u32) {
        let ids: Vec<u32> = self.nodes.values().filter(|n| n.image == Some(handle)).map(|n| n.id).collect();
        for id in ids { self.change(id); self.dirty = true; }
    }
    /// A view's drawing was recorded (the engine holds its picture): its reach, x y w h pad
    /// (empty: unknown).
    pub(crate) fn picture_made(&mut self, id: u32, b: &[f64]) {
        let reach = if b.len() >= 5 { Some([b[0], b[1], b[2], b[3], b[4]]) } else { None };
        match self.nodes.get_mut(&id) { Some(n) => n.pic_bounds = reach, None => { self.pic_early.insert(id, reach); } }
        self.dirty = true;
    }
    /// A field's text as the canvas draws it: its value in its style, or its placeholder in the
    /// browser's placeholder grey, one line or several, inside the field's padding.
    fn field_text(&mut self, id: u32, spec: &Value) {
        if spec.is_null() {
            let n = self.nm(id);
            n.field = 0; n.text.clear(); n.style = None; n.layout = None; n.lines = None; n.handles = None;
            return;
        }
        let st = spec.get("style").cloned().unwrap_or(Value::Null);
        let multiline = spec.get("multiline") == Some(&Value::Bool(true));
        let value = spec.get("value").and_then(Value::as_str).unwrap_or("");
        // a concealed field shows a dot for each character, as its element does
        let dots: String;
        let shown = if spec.get("concealed") == Some(&Value::Bool(true)) {
            dots = "\u{2022}".repeat(value.chars().count());
            dots.as_str()
        } else { value };
        let (text, color) = if value.is_empty() {
            (spec.get("placeholder").and_then(Value::as_str).unwrap_or(""), Value::String("#757575".into()))
        } else { (shown, st.get("color").cloned().unwrap_or(Value::Null)) };
        let family = match st.get("family") {
            Some(Value::Array(a)) => a.iter().map(jstr).collect::<Vec<_>>().join(", "),
            Some(Value::String(s)) => s.clone(),
            _ => "system-ui".into(),
        };
        let raw = json!({
            "family": family, "size": st.get("size"), "weight": st.get("weight"), "italic": st.get("italic"), "color": color,
            "align": st.get("align"), "wrap": multiline && spec.get("wrap") != Some(&Value::Bool(false)), "maxLines": if multiline { 0 } else { 1 },
            "letterSpacing": st.get("letterSpacing"), "lineHeight": 0, "pad": spec.get("padding"),
        }).to_string();
        let restyle = self.nd(id).style.as_ref().is_none_or(|s| s.raw != raw);
        let sid = if restyle { self.style_id(&raw) } else { 0 };
        let n = self.nm(id);
        n.field = if multiline { 2 } else { 1 };
        if restyle {
            let mut s = style_of(&serde_json::from_str(&raw).unwrap_or(Value::Null), &raw);
            s.sid = sid;
            n.style = Some(s); n.layout = None; n.lines = None; n.lines_for = -1.0; n.handles = None;
        }
        if n.text != text { n.text = text.to_string(); n.lines = None; n.lines_for = -1.0; n.handles = None; }
        self.text_stale.insert(id);
    }
    /// The page shows (or took away) a DOM field over field `id`: while it shows, the field
    /// draws its own text, and the canvas does not.
    pub(crate) fn field_shown(&mut self, id: u32, on: bool) {
        let Some(n) = self.nodes.get_mut(&id) else { return };
        if n.editing == on { return; }
        n.editing = on;
        if !on { self.text_stale.insert(id); }
        self.change(id);
        self.dirty = true;
    }

    /// A program's font face landed: text the fallback laid out is laid out again.
    pub(crate) fn fonts_changed(&mut self) {
        self.style_layouts.clear();
        let ids: Vec<u32> = self.nodes.values().filter(|n| !n.text.is_empty()).map(|n| n.id).collect();
        for id in ids {
            let n = self.nm(id);
            n.layout = None; n.lines = None; n.lines_for = -1.0; n.handles = None;
            self.text_stale.insert(id);
            self.bump(id);
        }
        self.full_next = true; self.dirty = true;
    }
    pub(crate) fn resize(&mut self, e: &mut Engine, width: f64, height: f64, dpr: f64) {
        self.width = width; self.height = height; self.dpr = dpr;
        self.full_next = true;
        e.resize(jround(width * dpr) as u32, jround(height * dpr) as u32);
        self.dirty = true;
    }

    // ── ops ────────────────────────────────────────────────────────────────────

    /// Apply a commit. Only a change to something drawn asks for a frame: the backend also
    /// sends geometry that did not move and ops that only the page acts on (the cursor, a
    /// field's focus), and a pointer moving over a still program must not redraw it.
    pub(crate) fn commit(&mut self, e: &mut Engine, json: &str, geoms: &[f64], n: usize) {
        // each op's arguments are read where they lie in the text, an object parsed only for an
        // op that carries one
        let ops: Vec<Vec<&serde_json::value::RawValue>> = match serde_json::from_str(json) {
            Ok(v) => v,
            Err(err) => { crate::log(&format!("[gpu] commit: {err}")); Vec::new() }
        };
        let mut gi = 0;
        for (i, o) in ops.iter().enumerate() {
            while gi < n && geoms[gi * 6] == i as f64 { self.geom(geoms, gi); gi += 1; }
            let code = rnum(o.first().copied()) as u32;
            *self.op_counts.entry(code).or_insert(0.0) += 1.0;
            let target = |o: &Vec<&serde_json::value::RawValue>| rnum(if code == op::INSERT { o.get(2) } else { o.get(1) }.copied()) as u32;
            // what leaves the screen leaves its area behind to redraw — inside a layer, in its content
            if code == op::DESTROY || code == op::INSERT {
                let id = rnum(if code == op::DESTROY { o.get(1) } else { o.get(2) }.copied()) as u32;
                self.bump(id);
                if self.nodes.contains_key(&id) {
                    let p = self.nd(id).painted;
                    match self.layer_of(id) {
                        Some(l) => { if let Some(p) = p { self.invalidate(l, &p); } self.change(l); self.dirty = true; }
                        None => {
                            // under a 3D view or in a mask's stencil, its area is not the screen's:
                            // that view, or the views masked, change instead
                            let (three, masks) = self.drawn_through(id);
                            match three {
                                Some(t) if t != id => { self.change(t); self.dirty = true; }
                                _ => if let Some(p) = p { self.lost.push(p); },
                            }
                            for v in masks { self.change(v); self.dirty = true; }
                        }
                    }
                }
            }
            self.op(e, o, code);
            if self.flags.census {
                let t = target(o);
                if let (Some(k), true) = (kind_of(code), self.nodes.contains_key(&t)) { *self.kinds.entry(t).or_insert(0) |= k; }
            }
            if keep_op(code) { self.keep_gen += 1; }
            if !scroll_only(code) {
                let t = target(o);
                if self.nodes.contains_key(&t) { self.touched.insert(t); if code == op::OPACITY { self.bump_under(t); } else { self.bump(t); } }
            }
            if code == op::GEOM { continue; }
            if undrawn(code) { continue; }
            self.dirty = true;
            if code == op::ROOT || code == op::PAGEFILL { self.full_next = true; continue; }
            let t = target(o);
            if self.nodes.contains_key(&t) { self.change(t); }
        }
        while gi < n { self.geom(geoms, gi); gi += 1; }
        self.pic_early.clear();
    }

    fn geom(&mut self, g: &[f64], i: usize) {
        let o = i * 6;
        let id = g[o + 1] as u32;
        if self.nodes.contains_key(&id) { self.place(id, g[o + 2], g[o + 3], g[o + 4], g[o + 5]); }
    }

    fn place(&mut self, id: u32, x: f64, y: f64, w: f64, h: f64) {
        let (w, h) = (jmax(0.0, w), jmax(0.0, h));
        let census = self.flags.census;
        let n = self.nm(id);
        if n.x == x && n.y == y && n.w == w && n.h == h { return; }
        let k = (if n.x != x || n.y != y { ch::MOVE } else { 0 }) | (if n.w != w || n.h != h { ch::SIZE } else { 0 });
        let resized = n.w != w;
        n.x = x; n.y = y; n.w = w; n.h = h;
        if resized && !n.text.is_empty() { self.text_stale.insert(id); }
        if census { *self.kinds.entry(id).or_insert(0) |= k; }
        self.touched.insert(id);
        // moved, not resized: what it draws is the same, only where (its kept walk is laid
        // again moved); its ancestors' generations go up
        if k == ch::MOVE {
            if let Some(p) = self.nd(id).parent { self.bump_under(p); }
            if self.showing(id) || self.nd(id).painted.is_some() {
                self.dirty = true;
                if self.changed_set.insert(id) { self.changed.push(id); }
            }
            return;
        }
        self.bump(id);
        if self.showing(id) || self.nd(id).painted.is_some() { self.dirty = true; self.change(id); }
    }

    /// Is the node on screen as far as the tree says: attached under the root, and it and
    /// every ancestor visible and not fully transparent?
    pub(crate) fn showing(&self, id: u32) -> bool {
        let mut k = Some(id);
        while let Some(i) = k {
            let n = &self.nodes[&i];
            if !n.visible || n.opacity <= 0.0 { return false; }
            if Some(i) == self.root { return true; }
            k = n.parent;
        }
        false
    }

    fn op(&mut self, e: &mut Engine, o: &[&serde_json::value::RawValue], code: u32) {
        let id = rnum(o.get(1).copied()) as u32;
        let a = |i: usize| o.get(i + 2).copied();
        let num = |i: usize| rnum(o.get(i + 2).copied());
        let has = self.nodes.contains_key(&id);
        if code == op::CREATE {
            if !has { let mut n = Node::new(id); n.pic_bounds = self.pic_early.remove(&id).flatten(); self.nodes.insert(id, n); }
            return;
        }
        match code {
            op::PAGEFILL => { self.page = rgba_raw(a(0)); self.shell.push(json!(["pageFill", self.page])); return; }
            op::CURSOR => { self.shell.push(json!(["cursor", rstr_or(a(0), "")])); return; }
            op::EDITFOCUS => { self.shell.push(json!(["editFocus", id, num(0) != 0.0])); return; }
            op::EDITSEL => { self.shell.push(json!(["editSel", id, num(0), num(1)])); return; }
            op::EDITAPPLY => { self.shell.push(json!(["editApply", id, rval(a(0)), rstr_or(a(1), "")])); return; }
            op::PERSPECTIVE => return,      // the children's TRANSFORM3D carry it
            _ => {}
        }
        if !has {
            if !matches!(code, op::DESTROY | op::INSERT | op::ROOT | op::DRAW | op::GEOM | op::FILL | op::GRADIENT | op::RADIUS | op::STROKE
                | op::SHADOW | op::VISIBLE | op::OPACITY | op::SCALE | op::ROTATE | op::TRANSFORM | op::BOXCLIP | op::IGNORECLIP | op::TEXT
                | op::TEXTSTYLE | op::SCROLLPOS | op::SCROLLXPOS | op::SCROLLGLIDE | op::SCROLL | op::SCROLLX | op::WHEELCLAIM
                | op::IGNORESCROLL | op::EDIT | op::FILTER | op::BACKDROP | op::TRANSFORM3D | op::CLIP | op::BLEND | op::MASK
                | op::IMAGE | op::MEDIA | op::STRETCH | op::IMAGEALIGN | op::TINT | op::SCALING | op::EMBED) { self.unknown_op(code); }
            return;
        }
        match code {
            op::DESTROY => {
                if let Some(p) = self.nd(id).parent { let c = &mut self.nm(p).children; if let Some(i) = c.iter().position(|&k| k == id) { c.remove(i); } }
                self.tear_down(e, id);
            }
            op::INSERT => {
                let c = rnum(a(0)) as u32;
                if !self.nodes.contains_key(&c) { return; }
                if let Some(p) = self.nd(c).parent { let ch = &mut self.nm(p).children; if let Some(i) = ch.iter().position(|&k| k == c) { ch.remove(i); } }
                let before = rnum(a(1));
                let kids = &mut self.nm(id).children;
                let at = if before >= 0.0 { kids.iter().position(|&k| k as f64 == before) } else { None };
                match at { Some(i) => kids.insert(i, c), None => kids.push(c) }
                self.nm(c).parent = Some(id);
            }
            op::ROOT => self.root = Some(id),
            // DRAW says whether the view shows its picture; the engine's copy goes with the view
            op::DRAW => self.nm(id).picture = !rnull(a(0)),
            op::GEOM => self.place(id, num(0), num(1), num(2), num(3)),
            op::FILL => { let f = rgba_raw(a(0)); let n = self.nm(id); n.gradient = None; n.fill = f; }
            op::GRADIENT => { let g = a(0).map(|r| gradient_of(&rval(Some(r)))); let n = self.nm(id); n.fill = None; n.gradient = g; }
            op::RADIUS => { let r = if a(3).is_some() { vec![num(0), num(1), num(2), num(3)] } else { vec![num(0)] }; self.nm(id).radii = r; }
            op::STROKE => {
                let n = self.nodes.get_mut(&id).unwrap();
                if a(7).is_some() {
                    n.stroke = None;
                    n.sides = Some([0, 1, 2, 3].map(|i| if rnull(a(2 * i)) { None } else { Some((num(2 * i), rgba_raw(a(2 * i + 1)).unwrap_or(0))) }));
                } else if rnull(a(0)) { n.stroke = None; n.sides = None; }
                else { n.sides = None; n.stroke = Some((num(0), rgba_raw(a(1)).unwrap_or(0))); }
            }
            op::SHADOW => { let s = if rnull(a(0)) { None } else { Some((num(0), num(1), num(2), rgba_raw(a(3)).unwrap_or(0))) }; self.nm(id).shadow = s; }
            op::VISIBLE => self.nm(id).visible = num(0) != 0.0,
            op::OPACITY => self.nm(id).opacity = num(0),
            op::SCALE => { let n = self.nm(id); n.scale = num(0); n.pivot_x = num(1); n.pivot_y = num(2); }
            op::ROTATE => self.nm(id).rotation = num(0),
            op::TRANSFORM => self.nm(id).affine = Some([num(0), num(1), num(2), num(3), num(4), num(5)]),
            op::BOXCLIP => self.nm(id).box_clip = num(0) != 0.0,
            op::IGNORECLIP => self.nm(id).ignore_clip = num(0) != 0.0,
            op::TEXT => {
                let t = rstr_or(a(0), "");
                let n = self.nm(id); n.text = t; n.lines = None; n.lines_for = -1.0; n.handles = None;
                self.text_stale.insert(id);
            }
            op::TEXTSTYLE => {
                // the same style again changes nothing it lays out
                if rnull(a(0)) { let n = self.nm(id); n.style = None; n.layout = None; n.lines = None; n.handles = None; return; }
                let raw = a(0).unwrap().get();
                if self.nd(id).style.as_ref().is_some_and(|s| s.raw == raw) { return; }
                let mut st = style_of(&rval(a(0)), raw);
                st.sid = self.style_id(raw);
                let n = self.nm(id); n.style = Some(st); n.layout = None; n.lines = None; n.lines_for = -1.0; n.handles = None;
                self.text_stale.insert(id);
            }
            // SCROLLPOS / SCROLLXPOS: a request (offset and range), or the range alone (offset
            // null: the host keeps its own, and a frame-old number never drags a live scroll back)
            op::SCROLLPOS => {
                let n = self.nm(id);
                if !rnull(a(1)) { n.ext_y = num(1); }
                let asked = !rnull(a(0));
                if asked { n.scroll_y = num(0); n.glide.retain(|g| !g.y); }
                self.clamp_scroll(id);
                if asked && self.page_root(id) { let y = self.nd(id).scroll_y; self.shell.push(json!(["pageScrollTo", y, 0])); }
            }
            op::SCROLLXPOS => {
                let n = self.nm(id);
                if !rnull(a(1)) { n.ext_x = num(1); }
                if !rnull(a(0)) { n.scroll_x = num(0); n.glide.retain(|g| g.y); }
                self.clamp_scroll(id);
            }
            op::SCROLLGLIDE => {
                let y = num(0) != 0.0;
                let (vw, vh) = self.viewport(id);
                let lim = if y { jmax(0.0, self.extent_y(id) - vh) } else { jmax(0.0, self.extent_x(id) - vw) };
                // the page's own scroll glides the page's way
                if y && self.page_root(id) { self.shell.push(json!(["pageScrollTo", jmin(lim, jmax(0.0, num(1))), num(2)])); return; }
                let now = crate::now();
                let n = self.nm(id);
                n.glide.retain(|g| g.y != y);
                let from = if y { n.scroll_y } else { n.scroll_x };
                n.glide.push(Glide { y, from, to: jmin(lim, jmax(0.0, num(1))), start: now, ms: jmax(1.0, num(2)), b: [num(3), num(4), num(5), num(6)], wheel: false });
                if !self.gliding.contains(&id) { self.gliding.push(id); }
                self.wants.tick = true;
            }
            op::SCROLL => { let n = self.nm(id); n.scrolls = num(0) != 0.0; if !n.scrolls { n.scroll_y = 0.0; } }
            op::SCROLLX => { let n = self.nm(id); n.scrolls_x = num(0) != 0.0; if !n.scrolls_x { n.scroll_x = 0.0; } }
            op::WHEELCLAIM => self.nm(id).wants_wheel = num(0) != 0.0,
            op::IGNORESCROLL => self.nm(id).ignore_scroll = num(0) != 0.0,
            op::EDIT => {
                let spec = rval(a(0));
                let on = !spec.is_null();
                if !on { self.nm(id).editing = false; }
                if on { if !self.edits.contains(&id) { self.edits.push(id); } } else { self.edits.retain(|&k| k != id); }
                let bx = if on { Some(self.box_of(id)) } else { None };
                match &bx { Some(b) => { self.edit_boxes.insert(id, b.to_string()); } None => { self.edit_boxes.remove(&id); } }
                self.field_text(id, &spec);
                self.shell.push(json!(["edit", id, spec, bx]));
            }
            op::FILTER => { self.nm(id).filters = filters_of(Some(&rval(a(0)))); self.layered(e, id); }
            op::BACKDROP => { self.nm(id).backdrop = filters_of(Some(&rval(a(0)))); self.layered(e, id); }
            op::TRANSFORM3D => { self.nm(id).three = !rnull(a(0)); self.layered(e, id); }
            op::CLIP => {
                let shaped = !rnull(a(0)) && e.set_shape(id, &rstr_or(a(0), ""));
                self.nm(id).shaped = shaped;
                if !shaped { e.drop_shape(id); }
            }
            op::BLEND => self.nm(id).blend = blend_of(&rstr_or(a(0), "")),
            op::MASK => {
                let m = if rnull(a(0)) { None }
                    else if rstr_or(a(0), "") == "gradient" { Some(Mask::Gradient(gradient_of(&rval(a(1))))) }
                    else { Some(Mask::View { stencil: num(1) as u32, x: num(2), y: num(3) }) };
                let on = m.is_some();
                self.nm(id).mask = m;
                if on { self.masked.insert(id); } else { self.masked.remove(&id); }
            }
            op::IMAGE => self.nm(id).image = if rnull(a(0)) { None } else { Some(num(0) as u32) },
            // a video: its frames are an engine image under the media key (media.ts)
            op::MEDIA => self.nm(id).image = if rnull(a(0)) { None } else { Some(MEDIA_KEY.wrapping_add(num(0) as u32)) },
            op::STRETCH => self.nm(id).stretch = rstr_or(a(0), "none"),
            op::IMAGEALIGN => { let (x, y) = (rstr_or(a(0), "center"), rstr_or(a(1), "center")); let n = self.nm(id); n.align_x = x; n.align_y = y; }
            op::TINT => self.nm(id).tint = rgba_raw(a(0)).unwrap_or(0),
            op::SCALING => { self.nm(id).pixelated = rstr_or(a(0), "") == "pixelated"; self.full_next = true; }
            // a DOMIsland: its element lives on the page; an AppIsland's tenant (run:…) is a subtree
            op::EMBED => {
                let slot = rstr_or(a(0), "");
                if !slot.is_empty() && !slot.starts_with("run:") {
                    match self.islands.iter_mut().find(|(k, _)| *k == id) { Some(r) => r.1.clear(), None => self.islands.push((id, String::new())) }
                    self.shell.push(json!(["island", id, slot]));
                } else if let Some(i) = self.islands.iter().position(|(k, _)| *k == id) {
                    self.islands.remove(i);
                    self.shell.push(json!(["island", id, ""]));
                }
                if slot.starts_with("run:") { self.shell.push(json!(["appIsland", id, slot])); }
            }
            _ => self.unknown_op(code),
        }
    }

    fn unknown_op(&mut self, code: u32) {
        if self.unknown.insert(code) { crate::log(&format!("[gpu] op {code} not drawn yet")); }
    }

    /// A view's effects changed: views drawn through layers are frames' concern while on screen.
    fn layered(&mut self, e: &mut Engine, id: u32) {
        let n = self.nd(id);
        if n.filters.is_some() || n.backdrop.is_some() || n.three {
            if !self.effects.contains(&id) { self.effects.push(id); }
        } else if let Some(i) = self.effects.iter().position(|&k| k == id) {
            self.effects.remove(i);
            for k in 0..3 { e.layer_drop(id * 4 + k); }
            self.nm(id).filter_made = None;
        } else { return; }
        self.full_next = true;
    }

    fn tear_down(&mut self, e: &mut Engine, id: u32) {
        let kids = self.nd(id).children.clone();
        for c in kids { if self.nodes.contains_key(&c) { self.tear_down(e, c); } }
        if self.nd(id).editing { self.edits.retain(|&k| k != id); self.shell.push(json!(["edit", id, Value::Null, Value::Null])); }
        e.picture_drop(id);
        e.drop_image(RASTER_BASE.wrapping_add(id));
        if self.nd(id).shadow_key.is_some() { e.layer_drop(id * 4 + 3); }
        if self.nd(id).shaped { e.drop_shape(id); }
        self.masked.remove(&id);
        if let Some(i) = self.islands.iter().position(|(k, _)| *k == id) { self.islands.remove(i); self.shell.push(json!(["island", id, ""])); }
        self.drop_layer(e, id);
        if let Some(i) = self.effects.iter().position(|&k| k == id) { self.effects.remove(i); for k in 0..3 { e.layer_drop(id * 4 + k); } }
        self.nodes.remove(&id);
    }

    // ── where things are ───────────────────────────────────────────────────────

    /// A node's transform from its own space to its parent's.
    pub(crate) fn local(&self, id: u32) -> M {
        let n = self.nd(id);
        let m = translate(n.x, n.y);
        if let Some(a) = &n.affine { return mul(&m, a); }
        if n.scale != 1.0 || n.rotation != 0.0 {
            let r = n.rotation * std::f64::consts::PI / 180.0;
            let (c, s) = (r.cos() * n.scale, r.sin() * n.scale);
            return mul(&m, &mul(&translate(n.pivot_x, n.pivot_y), &mul(&[c, s, -s, c, 0.0, 0.0], &translate(-n.pivot_x, -n.pivot_y))));
        }
        m
    }

    /// Children in paint order: a scroller's pinned children (ignoreScroll) sit over the
    /// content that scrolls under them, as on the Mac host.
    pub(crate) fn stacked(&self, id: u32) -> Vec<u32> { self.order(id).into_owned() }
    /// The same, lent when it is the children's own order (no pinned child to move up).
    pub(crate) fn order(&self, id: u32) -> std::borrow::Cow<'_, [u32]> {
        let n = self.nd(id);
        if !(n.scrolls || n.scrolls_x) || !n.children.iter().any(|k| self.nd(*k).ignore_scroll) { return std::borrow::Cow::Borrowed(&n.children); }
        let mut v: Vec<u32> = n.children.iter().copied().filter(|k| !self.nd(*k).ignore_scroll).collect();
        v.extend(n.children.iter().copied().filter(|k| self.nd(*k).ignore_scroll));
        std::borrow::Cow::Owned(v)
    }
    /// A scroller clips its children to its box, as a box clip does (the root clips to the window anyway).
    pub(crate) fn clips_kids(&self, id: u32) -> bool { let n = self.nd(id); n.box_clip || ((n.scrolls || n.scrolls_x) && Some(id) != self.root) }
    pub(crate) fn viewport(&self, id: u32) -> (f64, f64) { if Some(id) == self.root { (self.width, self.height) } else { let n = self.nd(id); (n.w, n.h) } }
    pub(crate) fn extent_y(&self, id: u32) -> f64 { let n = self.nd(id); if Some(id) == self.root { jmax(n.ext_y, n.h) } else { n.ext_y } }
    pub(crate) fn extent_x(&self, id: u32) -> f64 { let n = self.nd(id); if Some(id) == self.root { jmax(n.ext_x, n.w) } else { n.ext_x } }
    /// The chain from the root down to `id` (empty when not attached under the root… or the
    /// chain up to its topmost ancestor, which the caller checks).
    /// What `id` is drawn through that its own rects cannot place on the screen: the projected
    /// 3D view it is in (or is), and the views that a mask it is part of masks.
    pub(crate) fn drawn_through(&self, id: u32) -> (Option<u32>, Vec<u32>) {
        let (mut three, mut masks) = (None, Vec::new());
        let mut k = Some(id);
        while let Some(i) = k {
            let Some(n) = self.nodes.get(&i) else { break };
            if three.is_none() && n.three && n.projection.is_some() { three = Some(i); }
            for &v in &self.masked {
                if let Some(Mask::View { stencil, .. }) = self.nd(v).mask { if stencil == i { masks.push(v); } }
            }
            k = n.parent;
        }
        (three, masks)
    }

    pub(crate) fn chain(&self, id: u32) -> Vec<u32> {
        let mut c = Vec::new();
        let mut k = Some(id);
        while let Some(i) = k { c.push(i); k = self.nd(i).parent; }
        c.reverse();
        c
    }

    /// Where a field over node `n` goes, in the page's coordinates: its box (the transform's
    /// translation and scale), the part of the page its ancestors' box clips leave it,
    /// whether any of them hides it, and their opacity together.
    fn box_of(&self, id: u32) -> Value {
        let mut m = I;
        let chain = self.chain(id);
        let (mut cx0, mut cy0, mut cx1, mut cy1) = (f64::NEG_INFINITY, f64::NEG_INFINITY, f64::INFINITY, f64::INFINITY);
        let (mut shown, mut opacity) = (true, 1.0);
        let mut escapes = false;
        for (i, &k) in chain.iter().enumerate() {
            m = mul(&m, &self.local(k));
            let kn = self.nd(k);
            if !kn.visible { shown = false; }
            opacity *= kn.opacity;
            if k != id && self.clips_kids(k) && !escapes {
                let (x0, y0) = (m[4], m[5]);
                let (x1, y1) = (x0 + kn.w * m[0].hypot(m[1]), y0 + kn.h * m[2].hypot(m[3]));
                cx0 = jmax(cx0, x0); cy0 = jmax(cy0, y0); cx1 = jmin(cx1, x1); cy1 = jmin(cy1, y1);
            }
            escapes = i + 1 < chain.len() && self.nd(chain[i + 1]).ignore_clip;
            if k != id && (kn.scroll_x != 0.0 || kn.scroll_y != 0.0) && !self.nd(chain[i + 1]).ignore_scroll { m = mul(&m, &translate(-kn.scroll_x, -kn.scroll_y)); }
        }
        let n = self.nd(id);
        let clip = if cx0 == f64::NEG_INFINITY && cy0 == f64::NEG_INFINITY && cx1 == f64::INFINITY && cy1 == f64::INFINITY { Value::Null }
            else { json!({ "x": cx0, "y": cy0, "w": jmax(0.0, cx1 - cx0), "h": jmax(0.0, cy1 - cy0) }) };
        json!({ "x": m[4], "y": m[5], "w": n.w * m[0].hypot(m[1]), "h": n.h * m[2].hypot(m[3]), "clip": clip, "shown": shown && opacity > 0.0, "opacity": opacity })
    }
    fn place_islands(&mut self) {
        for i in 0..self.islands.len() {
            let (id, last) = (self.islands[i].0, &self.islands[i].1);
            let b = self.box_of(id);
            let key = b.to_string();
            if &key != last { self.islands[i].1 = key; self.shell.push(json!(["islandBox", id, b])); }
        }
    }
    /// The root, when the page scrolls the window for it.
    pub(crate) fn page_root(&self, id: u32) -> bool { self.page_native && Some(id) == self.root }
    /// The page scrolled the window to `y`: the root's offset.
    pub(crate) fn page_scroll(&mut self, y: f64) {
        let Some(root) = self.root.filter(|_| self.page_native) else { return };
        let (_, vh) = self.viewport(root);
        let y = jmin(jmax(0.0, self.extent_y(root) - vh), jmax(0.0, y));
        if self.nd(root).scroll_y == y { return; }
        self.nm(root).scroll_y = y;
        self.moved(root);
    }
    /// What the page needs to share input with the browser (shell.ts), sent when it changes:
    /// how tall the page is (the root's content), and the boxes where a wheel or a finger is
    /// ours — panes inside the page that scroll (1 down, 2 across), views that hear the wheel
    /// (4) or take a finger (8) — each the part of it its clips leave showing, page pixels.
    fn place_page(&mut self) {
        if !self.page_native { return; }
        let Some(root) = self.root else { return };
        let mut boxes: Vec<Value> = Vec::new();
        let mut ids: Vec<u32> = self.nodes.keys().copied().collect();
        ids.sort_unstable();
        for id in ids {
            if id == root { continue; }
            let n = self.nd(id);
            let (vw, vh) = (n.w, n.h);
            let mut kind = 0u32;
            if n.scrolls && self.extent_y(id) > vh + 0.5 { kind |= 1; }
            if n.scrolls_x && self.extent_x(id) > vw + 0.5 { kind |= 2; }
            if n.wants_wheel { kind |= 4; }
            if self.touch_claims.contains(&id) { kind |= 8; }
            if kind == 0 { continue; }
            let b = self.box_of(id);
            if b["shown"] != Value::Bool(true) { continue; }
            let (mut x0, mut y0) = (jnum(b.get("x")), jnum(b.get("y")));
            let (mut x1, mut y1) = (x0 + jnum(b.get("w")), y0 + jnum(b.get("h")));
            if let Some(c) = b.get("clip").filter(|c| !c.is_null()) {
                let (cx, cy) = (jnum(c.get("x")), jnum(c.get("y")));
                x0 = jmax(x0, cx); y0 = jmax(y0, cy); x1 = jmin(x1, cx + jnum(c.get("w"))); y1 = jmin(y1, cy + jnum(c.get("h")));
            }
            x0 = jmax(x0, 0.0); y0 = jmax(y0, 0.0); x1 = jmin(x1, self.width); y1 = jmin(y1, self.height);
            if x1 <= x0 || y1 <= y0 { continue; }
            boxes.push(json!([jround(x0), jround(y0), jround(x1 - x0), jround(y1 - y0), kind]));
        }
        let h = if self.nd(root).scrolls { self.extent_y(root) } else { self.height };
        let map = json!({ "h": h, "boxes": boxes });
        let key = map.to_string();
        if key == self.page_map { return; }
        self.page_map = key;
        self.shell.push(json!(["pageMap", map]));
    }
    /// The views that take a finger changed (the runtime's input wants).
    pub(crate) fn touch_claims(&mut self, add: &[f64], remove: &[f64]) {
        for &v in remove { self.touch_claims.remove(&(v as u32)); }
        for &v in add { self.touch_claims.insert(v as u32); }
        self.dirty = true;
    }
    /// Editable fields are moved only when their box changed (each move restyles the page's field).
    fn place_edits(&mut self) {
        for i in 0..self.edits.len() {
            let id = self.edits[i];
            let b = self.box_of(id);
            let key = b.to_string();
            if self.edit_boxes.get(&id) == Some(&key) { continue; }
            self.edit_boxes.insert(id, key);
            self.shell.push(json!(["editBox", id, b]));
        }
    }

    // ── the census ─────────────────────────────────────────────────────────────

    /// The census of the changes since the last frame: changed views per kind of change; those
    /// whose changes are placement alone; of those, the rigid ones — nothing under them
    /// changed, so their subtree's pixels are as before, only placed anew — and how many views
    /// those subtrees hold; and the views whose pixels change.
    fn take_census(&mut self) -> usize {
        let mut kinds = [0u32; 10];
        let shown: Vec<(u32, u32)> = self.kinds.iter().filter(|(id, _)| self.nodes.contains_key(id) && self.showing(**id)).map(|(a, b)| (*a, *b)).collect();
        let mut below = Set::default();
        for (n, _) in &shown {
            let mut k = self.nd(*n).parent;
            while let Some(p) = k { if !below.insert(p) { break; } k = self.nd(p).parent; }
        }
        fn count(h: &Host, id: u32) -> u32 { 1 + h.nd(id).children.iter().filter(|k| h.nd(**k).visible).map(|k| count(h, *k)).sum::<u32>() }
        fn under(h: &Host, id: u32, a: &mut Set) { a.insert(id); for k in &h.nd(id).children { if h.nd(*k).visible && !a.contains(k) { under(h, *k, a); } } }
        let mut affected = Set::default();
        let (mut place_only, mut rigid, mut rigid_views) = (0, 0, 0);
        for (n, b) in &shown {
            for (i, k) in kinds.iter_mut().enumerate() { if b & (1 << i) != 0 { *k += 1; } }
            if b & !PLACEMENT == 0 { place_only += 1; if !below.contains(n) { rigid += 1; rigid_views += count(self, *n); } }
            if b & PLACEMENT != 0 { under(self, *n, &mut affected); } else { affected.insert(*n); }
        }
        self.kinds.clear();
        if self.census.len() < 5000 {
            self.census.push(CensusRecord { changed: shown.len(), kinds, place_only, rigid, rigid_views, affected: affected.len(), visited: 0.0, drawn: 0.0, path: "skip" });
            self.census.len()
        } else { 0 }
    }

    /// For the timing rig: frames, frame times, census, counts — as JSON; `clear` starts anew.
    pub(crate) fn stats(&mut self, e: &mut Engine, clear: bool) -> String {
        self.collect_done(e);
        let census: Vec<Value> = self.census.iter().map(|r| json!({ "changed": r.changed, "kinds": r.kinds, "placeOnly": r.place_only,
            "rigid": r.rigid, "rigidViews": r.rigid_views, "affected": r.affected, "visited": r.visited, "drawn": r.drawn, "path": r.path })).collect();
        let mut counts = serde_json::Map::new();
        for (i, k) in ct::NAMES.iter().enumerate() { if i < 4 || self.counts[i] != 0.0 { counts.insert((*k).into(), json!(self.counts[i])); } }
        let d = self.damage_counts;
        let out = json!({
            "frames": self.frames,
            "log": self.frame_log,
            "timing": self.timing.iter().map(|t| [t.id as f64, t.start, t.encode, t.done, t.input_to_submit]).collect::<Vec<_>>(),
            "ops": self.op_counts.iter().map(|(k, v)| (k.to_string(), json!(v))).collect::<serde_json::Map<_, _>>(),
            "counts": counts,
            "damage": { "full": d[0], "partial": d[1], "skipped": d[2], "partialArea": d[3] },
            "census": census,
            "sampled": self.sampled_count,
        });
        if clear {
            self.op_counts.clear(); self.counts = [0.0; ct::NAMES.len()]; self.damage_counts = [0.0; 4]; self.census.clear();
            self.timing.clear(); self.by_id.clear(); self.frame_log.clear();
        }
        out.to_string()
    }

    /// Diagnostic: the nodes whose text holds `text`, each with its chain up to the root
    /// (`#id`: that node's subtree, in paint order).
    pub(crate) fn probe(&self, text: &str) -> String {
        let mut out: Vec<Value> = Vec::new();
        if let Some(id) = text.strip_prefix('#').and_then(|s| s.parse::<u32>().ok()) {
            fn walk(h: &Host, k: u32, depth: usize, out: &mut Vec<Value>) {
                let n = h.nd(k);
                let mut s = format!("{}#{} {},{} {}x{}", "  ".repeat(depth), n.id, n.x, n.y, n.w, n.h);
                if !n.visible { s += " hidden"; }
                if n.opacity < 1.0 { s += &format!(" op{}", n.opacity); }
                if let Some(f) = n.fill { s += &format!(" fill{f:x}"); }
                if n.gradient.is_some() { s += " grad"; }
                if n.picture { s += &format!(" pic{:?}", n.pic_bounds); }
                if n.image.is_some() { s += " img"; }
                if h.clips_kids(k) { s += " clip"; }
                if !n.text.is_empty() { s += &format!(" \"{}\"", n.text.chars().take(30).collect::<String>()); }
                if n.scale != 1.0 || n.rotation != 0.0 { s += &format!(" s{} r{}", n.scale, n.rotation); }
                if let Some(a) = n.affine { s += &format!(" affine{a:?}"); }
                if n.scrolls { s += &format!(" scrolls ext={} y={}", n.ext_y, n.scroll_y); }
                out.push(Value::String(s));
                if depth < 6 { for c in h.stacked(k) { walk(h, c, depth + 1, out); } }
            }
            if self.nodes.contains_key(&id) { walk(self, id, 0, &mut out); }
            return Value::Array(out).to_string();
        }
        for n in self.nodes.values() {
            if !n.text.contains(text) { continue; }
            let chain: Vec<Value> = self.chain(n.id).into_iter().rev().map(|k| {
                let kn = self.nd(k);
                json!({ "id": k, "x": kn.x, "y": kn.y, "w": kn.w, "h": kn.h, "vis": kn.visible, "op": kn.opacity, "clip": self.clips_kids(k),
                    "scroll": [kn.scroll_x, kn.scroll_y], "painted": kn.painted.map(|r| [r.x0, r.y0, r.x1, r.y1]), "root": Some(k) == self.root })
            }).collect();
            out.push(json!({ "id": n.id, "text": n.text.chars().take(60).collect::<String>(), "style": n.style.as_ref().map(|s| s.raw.clone()), "chain": chain }));
        }
        Value::Array(out).to_string()
    }
}
