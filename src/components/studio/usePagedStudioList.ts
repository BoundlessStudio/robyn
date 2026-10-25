"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

export function usePagedStudioList<T extends {id:string}>(url: string, field: string) {
  const [rows, setRows] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const load = useCallback(async (cursor: string|null = null, signal?: AbortSignal) => {
    const requestGeneration = ++generation.current;
    setLoading(true); setError("");
    try {
      const address = `${url}${url.includes("?") ? "&" : "?"}${cursor ? `cursor=${encodeURIComponent(cursor)}` : ""}`;
      const data = await apiFetch<Record<string, unknown>>(address, {signal});
      if (requestGeneration !== generation.current || signal?.aborted) return;
      const items = data[field] as T[];
      setRows(previous => cursor ? [...new Map([...previous,...items].map(row=>[row.id,row])).values()] : items);
      setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (error) {
      if (requestGeneration === generation.current && !signal?.aborted) setError((error as Error).message);
    } finally { if (requestGeneration === generation.current && !signal?.aborted) setLoading(false); }
  }, [url, field]);
  useEffect(() => {
    const abort = new AbortController();
    setRows([]);setNextCursor(null);
    const timer = setTimeout(() => void load(null, abort.signal), 200);
    return () => { clearTimeout(timer);abort.abort();generation.current++; };
  }, [load]);
  return { rows, nextCursor, loading, error, reload: () => load(), loadMore: () => nextCursor && !loading ? load(nextCursor) : Promise.resolve() };
}
