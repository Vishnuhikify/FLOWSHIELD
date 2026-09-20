import { useCallback, useRef, useState } from "react";
import { compare } from "../services/api";

/** Request lifecycle for POST /api/compare. `key` identifies the inputs the comparison on screen was made from. */
export function useComparison() {
  const [state, setState] = useState({ data: null, key: null, status: "idle", error: null });
  const latest = useRef(0);

  const run = useCallback(async (payload) => {
    const id = ++latest.current;
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      const data = await compare(payload);
      if (id === latest.current) setState({ data, key: JSON.stringify(payload), status: "success", error: null });
      return data;
    } catch (error) {
      if (id === latest.current) setState((s) => ({ ...s, status: "error", error }));
      return null;
    }
  }, []);

  const clear = useCallback(() => {
    latest.current += 1;
    setState({ data: null, key: null, status: "idle", error: null });
  }, []);

  return { ...state, run, clear };
}
