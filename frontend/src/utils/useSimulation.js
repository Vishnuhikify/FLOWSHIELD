import { useCallback, useRef, useState } from "react";
import { simulate } from "../services/api";

/** Owns the request lifecycle. Keeps the previous result on screen while a new run loads. */
export function useSimulation() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [error, setError] = useState(null);
  const latest = useRef(0);

  const run = useCallback(async (payload) => {
    const id = ++latest.current; // only the most recent request may update state
    setStatus("loading");
    setError(null);
    try {
      const result = await simulate(payload);
      if (id !== latest.current) return null;
      setData(result);
      setStatus("success");
      return result;
    } catch (err) {
      if (id !== latest.current) return null;
      setError(err);
      setStatus("error");
      return null;
    }
  }, []);

  return { data, status, error, run };
}
