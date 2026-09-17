import { useCallback, useEffect, useState } from "react";
import { configured } from "./config.js";
import { db } from "./auth.js";
import { useUser } from "./useAuth.js";
import { uid } from "./timetable.js";
import { event } from "./analytics.js";

const COLUMNS = "id,ref,action,starts_on,ends_on,slot,saved_at";
const KEY = (who) => `iiest.schedule.${who.id}`;
const EMPTY = { edits: [], gone: [] };

// localStorage is the offline buffer as well as the cache: `dirty` marks a
// patch this browser has not managed to push yet, `gone` the ids it has not
// managed to delete yet. Both are replayed the next time the account loads.
function readCache(who) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(who)) || "null");
    return {
      edits: Array.isArray(raw?.edits) ? raw.edits : [],
      gone: Array.isArray(raw?.gone) ? raw.gone : [],
    };
  } catch {
    return EMPTY;
  }
}

function writeCache(who, cache) {
  try {
    localStorage.setItem(KEY(who), JSON.stringify(cache));
  } catch {
    /* storage full or blocked: edits then last only for this page */
  }
}

const row = (who, e) => ({
  student: who.id, id: e.id, ref: e.ref, action: e.action,
  starts_on: e.starts_on, ends_on: e.ends_on || null,
  slot: e.slot || null, saved_at: e.saved_at,
});

export function useEdits() {
  const who = useUser();
  const [cache, setCache] = useState(EMPTY);
  const [error, setError] = useState(null);

  const apply = useCallback((fn) => {
    setCache((prev) => {
      const next = fn(prev);
      if (who) writeCache(who, next);
      return next;
    });
  }, [who]);

  useEffect(() => {
    if (!who) {
      setCache(EMPTY);
      return () => {};
    }
    const local = readCache(who);
    setCache(local);
    setError(null);
    if (!configured()) return () => {};

    let alive = true;
    (async () => {
      try {
        const dirty = local.edits.filter((e) => e.dirty);
        if (dirty.length) {
          await db("schedule_edits", {
            method: "POST",
            body: dirty.map((e) => row(who, e)),
            prefer: "resolution=merge-duplicates,return=minimal",
          });
        }
        for (const id of local.gone) {
          await db("schedule_edits", { method: "DELETE", params: { id: `eq.${id}` } });
        }
        const rows = (await db("schedule_edits", { params: { select: COLUMNS } })) || [];
        if (!alive) return;
        const next = { edits: rows, gone: [] };
        writeCache(who, next);
        setCache(next);
        setError(null);
      } catch (err) {
        if (alive && navigator.onLine) setError(err);
      }
    })();
    return () => { alive = false; };
  }, [who]);

  const save = useCallback(async (edit) => {
    if (!who) return;
    const full = { ...edit, id: edit.id || uid(), saved_at: new Date().toISOString() };
    apply((prev) => ({
      ...prev,
      edits: [...prev.edits.filter((e) => e.id !== full.id), { ...full, dirty: true }],
    }));
    event(edit.action === "drop" ? "schedule-drop"
      : edit.id ? "schedule-edit" : "schedule-add");

    if (!configured()) return;
    try {
      await db("schedule_edits", {
        method: "POST",
        body: row(who, full),
        prefer: "resolution=merge-duplicates,return=minimal",
      });
      apply((prev) => ({
        ...prev,
        edits: prev.edits.map((e) => (e.id === full.id ? { ...e, dirty: false } : e)),
      }));
      setError(null);
    } catch (err) {
      if (navigator.onLine) setError(err);
    }
  }, [who, apply]);

  const remove = useCallback(async (id) => {
    if (!who) return;
    apply((prev) => ({
      edits: prev.edits.filter((e) => e.id !== id),
      gone: [...new Set([...prev.gone, id])],
    }));
    event("schedule-undo");

    if (!configured()) {
      apply((prev) => ({ ...prev, gone: [] }));
      return;
    }
    try {
      await db("schedule_edits", { method: "DELETE", params: { id: `eq.${id}` } });
      apply((prev) => ({ ...prev, gone: prev.gone.filter((g) => g !== id) }));
      setError(null);
    } catch (err) {
      if (navigator.onLine) setError(err);
    }
  }, [who, apply]);

  return { list: cache.edits, save, remove, error };
}
