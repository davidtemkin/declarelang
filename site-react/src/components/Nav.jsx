import { useEffect, useState } from "react";
import { navLinks } from "../content.js";

// Fixed top bar that fades in once the hero has scrolled away.
export default function Nav() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 160);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav className={`nav ${show ? "show" : ""}`}>
      <div className="container">
        <a className="nav-word" href="#top">Declare</a>
        <div className="nav-links">
          {navLinks.map((l) => (
            <a key={l.label} href={l.href}>{l.label}</a>
          ))}
        </div>
      </div>
    </nav>
  );
}
