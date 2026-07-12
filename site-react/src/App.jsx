import Nav from "./components/Nav.jsx";
import Reveal from "./components/Reveal.jsx";
import Demo from "./components/Demo.jsx";
import {
  hero,
  quoteLegible,
  sectionRead,
  sectionSmall,
  closing,
  demos,
} from "./content.js";

export default function App() {
  return (
    <>
      <div className="grid-bg" />
      <Nav />
      <div className="page" id="top">
        {/* Hero */}
        <header className="hero">
          <div className="container">
            <h1>
              <span className="word">{hero.word}</span>
              <br />
              <span className="rest">{hero.rest}</span>
            </h1>
            <p className="lead">{hero.lead}</p>
            <div className="hero-actions">
              {hero.actions.map((a) => (
                <a
                  key={a.label}
                  className={`btn ${a.primary ? "btn-primary" : "btn-ghost"}`}
                  href={a.href}
                >
                  {a.label}
                </a>
              ))}
            </div>
          </div>
        </header>

        {/* 01 — Read it. Generate it. Run it. */}
        <section className="section">
          <div className="container">
            <Reveal>
              <div className="section-num">{sectionRead.num}</div>
              <h2>{sectionRead.title}</h2>
              <p className="desc">{sectionRead.desc}</p>
            </Reveal>
            <div className="cards">
              {sectionRead.cards.map((c) => (
                <Reveal as="article" className="card" key={c.title}>
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Pull-quote */}
        <section className="quote">
          <div className="container">
            <Reveal>
              <p>{quoteLegible.text}</p>
              <p className="mono">{quoteLegible.mono}</p>
            </Reveal>
          </div>
        </section>

        {/* 02 — Small. Fast. Renderer-independent. */}
        <section className="section">
          <div className="container">
            <Reveal>
              <div className="section-num">{sectionSmall.num}</div>
              <h2>{sectionSmall.title}</h2>
            </Reveal>
            <div className="stats">
              {sectionSmall.stats.map((s) => (
                <Reveal className="stat" key={s.num}>
                  <div className="num">{s.num}</div>
                  <div className="cap">{s.cap}</div>
                </Reveal>
              ))}
            </div>
            <div className="cols">
              {sectionSmall.cols.map((c) => (
                <Reveal className="col" key={c.title}>
                  <h4>{c.title}</h4>
                  <p>{c.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* 03–06 — live editable demos */}
        {demos.map((d) => (
          <Demo demo={d} key={d.key} />
        ))}

        {/* Closing statement */}
        <section className="quote closing">
          <div className="container">
            <Reveal>
              <div className="rule" />
              <p>{closing.a}</p>
              <p style={{ marginTop: "1.4em" }}>{closing.b}</p>
              <p className="sub">{closing.sub}</p>
              <div className="rule below" />
            </Reveal>
          </div>
        </section>

        {/* Footer */}
        <footer className="footer" id="source">
          <div className="container">
            <span>Built in</span>
            <span className="brand">Declare</span>
            <span className="dot">·</span>
            <a href="https://github.com/davidtemkin/declarelang">View &amp; Edit Source</a>
          </div>
        </footer>
      </div>
    </>
  );
}
