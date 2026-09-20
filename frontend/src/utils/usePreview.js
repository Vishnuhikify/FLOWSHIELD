import { useEffect, useRef, useState } from "react";
import { previewInterventions } from "../services/api";

/** Debounced, latest-wins call to POST /api/interventions/preview. `payload` null = no preview needed. */
export function usePreview(payload, delay = 250) {
  const [state, setState] = useState({ preview: null, error: null, loading: false });
  const key = payload ? JSON.stringify(payload) : null;
  const latest = useRef(0);

  useEffect(() => {
    if (!key) {
      setState({ preview: null, error: null, loading: false });
      return undefined;
    }
    const id = ++latest.current;
    setState((s) => ({ ...s, loading: true }));
    const timer = setTimeout(() => {
      previewInterventions(JSON.parse(key))
        .then((preview) => id === latest.current && setState({ preview, error: null, loading: false }))
        .catch((error) => id === latest.current && setState({ preview: null, error, loading: false }));
    }, delay);
    return () => clearTimeout(timer);
  }, [key, delay]);

  return state;
}
