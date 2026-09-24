// Drag a bar to move it, or its edge handles to resize it (AC17, AC18, AC19, AC28, AC39).
// While the pointer is down only this bar's local state changes: it is drawn at the proposed
// dates, snapped to whole days, and nothing is written. On release the change goes to the server
// as one PATCH, and the bar keeps the proposed position until the response lands. Then it shows
// the server's dates, which may be clamped or cascaded (the "settle"). A rejected change snaps
// back, and the store shows the message.
import { type PointerEvent, useRef, useState } from "react";
import type { Task } from "../../api/types.ts";
import { useActions } from "../../state/store.tsx";
import { type DragMode, daysFromPixels, patchForDrag, proposeDrag } from "../../timeline/drag.ts";
import type { Zoom } from "../../timeline/scale.ts";

/** A press that moves less than this is a click, which opens the editor instead. */
const CLICK_SLOP_PX = 3;

/** The attribute a resize handle in Bars.tsx carries to say which edge it moves. */
const HANDLE_ATTR = "data-drag-mode";

export interface DragDates {
  start: string;
  end: string;
}

interface Gesture {
  pointerId: number;
  mode: DragMode;
  originX: number;
  moved: boolean;
  proposal: DragDates;
}

export interface BarDrag {
  /** The dates to draw at, while dragging or waiting for the server; null shows the task's own. */
  proposal: DragDates | null;
  dragging: boolean;
  handlers: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
    onClick: () => void;
  };
}

function modeFor(target: EventTarget, task: Task): DragMode {
  if (task.is_milestone || !(target instanceof Element)) {
    return "move";
  }
  const mode = target.closest(`[${HANDLE_ATTR}]`)?.getAttribute(HANDLE_ATTR);
  return mode === "resize-start" || mode === "resize-end" ? mode : "move";
}

export function useBarDrag(task: Task, zoom: Zoom, onOpen: (id: number) => void): BarDrag {
  const { updateTask } = useActions();
  const [proposal, setProposal] = useState<DragDates | null>(null);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  // Set while a PATCH from this bar is in flight, so a second drag can't race the first.
  const saving = useRef(false);
  // A drag ends with a click event on the bar; this swallows it so a drag never opens the editor.
  const swallowClick = useRef(false);

  function finish(event: PointerEvent<HTMLElement>): Gesture | null {
    const g = gesture.current;
    if (g === null || g.pointerId !== event.pointerId) {
      return null;
    }
    gesture.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    return g;
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    swallowClick.current = false;
    if (event.button !== 0 || gesture.current !== null || saving.current) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      mode: modeFor(event.target, task),
      originX: event.clientX,
      moved: false,
      proposal: { start: task.start, end: task.end },
    };
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (g === null || g.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - g.originX;
    if (!g.moved) {
      if (Math.abs(dx) < CLICK_SLOP_PX) {
        return;
      }
      g.moved = true;
      setDragging(true);
    }
    const next = proposeDrag(task, g.mode, daysFromPixels(dx, zoom));
    if (next.start !== g.proposal.start || next.end !== g.proposal.end) {
      g.proposal = next;
      setProposal(next);
    }
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const g = finish(event);
    if (g === null || !g.moved) {
      // Under the click slop: the click event that follows opens the editor.
      return;
    }
    swallowClick.current = true;
    const patch = patchForDrag(task, g.mode, g.proposal);
    if (patch === null) {
      setProposal(null);
      return;
    }
    saving.current = true;
    void updateTask(task.id, patch).finally(() => {
      saving.current = false;
      setProposal(null);
    });
  }

  function onPointerCancel(event: PointerEvent<HTMLElement>) {
    if (finish(event) !== null) {
      setProposal(null);
    }
  }

  function onClick() {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    onOpen(task.id);
  }

  return {
    proposal,
    dragging,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick },
  };
}
