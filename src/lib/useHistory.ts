import { useCallback, useEffect, useRef, useState } from "react";

const LIMIT = 100;
/** Changes closer together than this (typing a word) undo as one step. */
const COALESCE_MS = 1000;

/**
 * Undo/redo for a state value. Every change is recorded, except changes made
 * by undo/redo themselves; bursts of changes are grouped into one step.
 * Calling `reset` (after switching documents) forgets the history.
 */
export function useHistory<T>(value: T, setValue: (value: T) => void) {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const previous = useRef(value);
  const lastChange = useRef(0);
  const skip = useRef(false);
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (previous.current === value) return;
    if (skip.current) {
      skip.current = false;
    } else {
      const now = Date.now();
      if (now - lastChange.current > COALESCE_MS || past.current.length === 0) {
        past.current.push(previous.current);
        if (past.current.length > LIMIT) past.current.shift();
      }
      lastChange.current = now;
      future.current = [];
    }
    previous.current = value;
    setVersion((v) => v + 1);
  }, [value]);

  const undo = useCallback(() => {
    const target = past.current.pop();
    if (target === undefined) return false;
    future.current.push(previous.current);
    skip.current = true;
    lastChange.current = 0;
    setValue(target);
    return true;
  }, [setValue]);

  const redo = useCallback(() => {
    const target = future.current.pop();
    if (target === undefined) return false;
    past.current.push(previous.current);
    skip.current = true;
    lastChange.current = 0;
    setValue(target);
    return true;
  }, [setValue]);

  /** Starts a fresh history from `next`, the value about to be set. */
  const reset = useCallback((next: T) => {
    past.current = [];
    future.current = [];
    previous.current = next;
    skip.current = false;
    lastChange.current = 0;
    setVersion((v) => v + 1);
  }, []);

  /** Ends the current group, so the next change is its own undo step. */
  const checkpoint = useCallback(() => {
    lastChange.current = 0;
  }, []);

  return { undo, redo, reset, checkpoint, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
