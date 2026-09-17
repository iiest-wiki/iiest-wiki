// Personal timetable edits.
//
// The published .ics files are already versioned by effective date so that
// replacing a routine mid-term does not rewrite attendance that was marked
// against the old one. A student's own changes work the same way: an edit is
// never applied in place, it is a patch that starts on a date the student
// picks. Every day before that date still resolves against the class as it was,
// so percentages already earned stay exactly where they were.
//
// A patch names one class by ref and either replaces it ("set") or takes it off
// the routine ("drop"). A class the student added for themselves has no line in
// the published routine, so it gets a ref of its own, prefixed "x:".

export const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const newRef = () => `x:${uid()}`;

export const isExtra = (ref) => String(ref).startsWith("x:");

// The same identity attendance is keyed on, so moving a class forward in time
// leaves the marks it already collected attached to the days it was taught on.
export const refOf = (slot) => slot.ref || `${slot.day}|${slot.start}|${slot.code}`;

const inForce = (e, iso) =>
  e.starts_on <= iso && (!e.ends_on || iso < e.ends_on);

const order = (a, b) =>
  a.starts_on.localeCompare(b.starts_on) ||
  String(a.saved_at || "").localeCompare(String(b.saved_at || ""));

// The last patch to take effect on or before `iso` wins for its class, which is
// what lets a student change the same class twice over a term.
function inPlay(edits, iso) {
  const live = new Map();
  for (const e of [...edits].sort(order)) {
    if (inForce(e, iso)) live.set(e.ref, e);
  }
  return live;
}

export function applyEdits(slots, edits, iso) {
  if (!edits || !edits.length) return slots;
  const live = inPlay(edits, iso);
  if (!live.size) return slots;

  const out = [];
  const onRoutine = new Set();

  for (const slot of slots) {
    const ref = refOf(slot);
    onRoutine.add(ref);
    const patch = live.get(ref);
    if (!patch) {
      out.push(slot);
    } else if (patch.action !== "drop") {
      out.push({ ...slot, ...patch.slot, ref, mine: true });
    }
  }

  for (const [ref, patch] of live) {
    // A patch on a published class that has since vanished from the routine is
    // stale, not an extra class, so it is ignored rather than resurrected.
    if (onRoutine.has(ref) || patch.action === "drop" || !isExtra(ref)) continue;
    out.push({ ...patch.slot, ref, mine: true, extra: true });
  }
  return out;
}

// What the student did, in the words the changes list uses. The first patch on
// a ref of its own is the class being added; anything after it is a revision.
export function describe(edit, all) {
  if (edit.action === "drop") return "Removed";
  if (!isExtra(edit.ref)) return "Changed";
  const first = all.filter((e) => e.ref === edit.ref).sort(order)[0];
  return first && first.id === edit.id ? "Added" : "Changed";
}
