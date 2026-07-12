import { useEffect, useRef, useState } from "react";
import { compile, mount, dispose } from "../lib/declare.js";
import Reveal from "./Reveal.jsx";

// One demo block: an editable .declare program on the left, its live compiled app
// on the right. Editing recompiles (debounced) and swaps the running preview; a
// compile/runtime failure keeps the last good render. The preview is a genuine
// Declare app — mounted via the runtime, not re-created in React.
export default function Demo({ demo }) {
  const [text, setText] = useState(demo.seed);
  const [err, setErr] = useState("");
  const boxRef = useRef(null);
  const dirty = text !== demo.seed;

  // (Re)compile + mount whenever the text settles.
  useEffect(() => {
    let alive = true;
    const box = boxRef.current;
    const t = setTimeout(async () => {
      const { source, errors } = await compile(text);
      if (!alive) return;
      if (source) {
        try {
          await mount(box, source);
          if (alive) setErr("");
        } catch (e) {
          if (alive) setErr(String(e?.message || e));
        }
      } else {
        if (alive) setErr((errors && errors[0]?.message) || "compile error");
      }
    }, 180);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [text]);

  // Dispose the running preview on unmount.
  useEffect(() => {
    const box = boxRef.current;
    return () => dispose(box);
  }, []);

  return (
    <section className="section" id={demo.num}>
      <div className="container">
        <Reveal>
          <div className="section-num">{demo.num}</div>
          <h2>{demo.title}</h2>
          <p className="desc">{demo.desc}</p>
          <p className="desc small">{demo.note}</p>
        </Reveal>

        <div className="demo">
          <div className="editor">
            <div className="editor-bar">
              <span className="file">{demo.file}</span>
              <span className="hint">edit — preview runs live</span>
              <button
                className="revert"
                disabled={!dirty}
                onClick={() => setText(demo.seed)}
              >
                Revert
              </button>
            </div>
            <textarea
              className="code"
              spellCheck={false}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {/* data-neo-app makes the runtime treat the mount as an embedded preview */}
          <div className="preview-wrap" data-neo-app>
            <div className="preview-mount" ref={boxRef} />
            {err ? <div className="preview-err">{err}</div> : null}
          </div>
        </div>

        <div className="caption">{demo.caption}</div>
      </div>
    </section>
  );
}
