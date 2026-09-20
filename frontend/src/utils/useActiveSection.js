import { useEffect, useState } from "react";

/** Id of the section currently nearest the top of the viewport, for the header navigation. */
export function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join(",");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const visible = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => visible.set(e.target.id, e.isIntersecting));
        const first = key.split(",").find((id) => visible.get(id));
        if (first) setActive(first);
      },
      { rootMargin: "-90px 0px -55% 0px" }
    );
    const observed = () => key.split(",").forEach((id) => { const el = document.getElementById(id); if (el) observer.observe(el); });
    observed();
    const retry = setInterval(observed, 1000); // sections mount after the first result arrives
    return () => { clearInterval(retry); observer.disconnect(); };
  }, [key]);
  return active;
}
