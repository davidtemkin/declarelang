// categories.mjs — classify an LZX-runtime function (by its profile-build displayName)
// into a startup-cost category. Used by lzprof.mjs. Names look like "<node>",
// "<view>/construct", "LzDelegate/register", "new LzDelegate", "Instance", "$lzc$set_x",
// "kernel/dhtml/LzSprite.js#1143/27".

export function categoryOf(n) {
  // VIEW INSTANTIATION — constructing the logical node/view object tree + initializing it
  if (/^new (<|Class|Lz(View|Node|Canvas|State|Layout|Animator))/.test(n)) return "instantiate";
  if (/^<[^>]*>(\(.*\))?$/.test(n)) return "instantiate";                 // class ctors: <node>, <anonymous extends='view'>(#calgrid)
  if (/(\/construct|\/init|__LZapplyArgs|__LZcallInit|__LZinstantiationDone|__LZinstantiate|__LZstoreAttr|makeChild|requestInstantiation|InstantiateView|mergeAttributes)$/.test(n)) return "instantiate";
  if (/(__LZcheckSize|__LZcheckheight|__LZcheckwidth)/.test(n)) return "instantiate";
  if (/^Instance($|\/)/.test(n) || /InheritedHash/.test(n) || /(Class\.make|Class\.addProperties|Class\.addStaticProperty|addProperties)$/.test(n)) return "instantiate";
  // CONSTRAINT RESOLUTION — the dependency/constraint/event-delegate machinery
  if (/Delegate/.test(n)) return "constraint";                           // LzDelegate, new LzDelegate, /register, /execute
  if (/(LzEvent|LzDeclaredEvent|sendEvent)/.test(n)) return "constraint"; // the on<attr> events constraints ride on
  if (/(applyConstraint|ConstraintExpr|AlwaysExpr|OnceExpr|InitExpr|StyleConstraint|__LZresolveReferences)/.test(n)) return "constraint";
  if (/(\$\{|dependencies)$/.test(n)) return "constraint";               // constraint setters & "x dependencies" methods
  // ATTRIBUTE SET/CALC — setAttribute + generated value setters (the constraint↔plain boundary)
  if (/(\$lzc\$set_|\/setAttribute$|updateHeight|updateWidth|__LZsetCalculated)/.test(n)) return "attr-set";
  // OTHER LFC SUBSYSTEMS
  if (/(LzSprite|LzShape|__makeSprite|CSSDimension|resourceload)/i.test(n)) return "sprite-dom";  // the DOM shadow layer (JS side)
  if (/Font/i.test(n)) return "font";
  if (/(ColorUtils|inttohex|convertColor)/i.test(n)) return "color";
  if (/(XMLParser|XMLTranslator|DataElement|DataNode|Dataset|Datapath|DataProvider|HTTPLoader)/i.test(n)) return "data";
  if (/addSubview/.test(n)) return "layout";
  return "other";
}

// Display order for the report.
export const ORDER = ["instantiate","constraint","attr-set","sprite-dom","layout","font","color","data","other"];
