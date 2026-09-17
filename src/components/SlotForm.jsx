import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import { DAY_NAMES } from "../lib/calendar.js";
import { newRef, isExtra } from "../lib/timetable.js";
import { fmtDate, toMin, weekdayOf } from "../lib/util.js";

const KINDS = ["Lecture", "Lab", "Tutorial", "Project", "Activity"];
const DAYS = [0, 1, 2, 3, 4];

const blank = {
  code: "", title: "", profs: [], kind: "Lecture", room: "",
  day: 0, start: "09:00", end: "09:55", weekly: true,
};

export default function SlotForm({ draft, onSave, onClose }) {
  const adding = !draft.ref;
  // Reopened from the changes list, a removal is still a removal; the only
  // thing worth changing about it is the date it took effect.
  const dropping = draft.action === "drop";

  const [form, setForm] = useState(() => {
    const slot = { ...blank, ...(draft.slot || {}) };
    return { ...slot, profs: (slot.profs || []).join(", "), from: draft.from };
  });
  const [fault, setFault] = useState("");

  const set = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("locked");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("locked");
    };
  }, [onClose]);

  // A one-off sits on whatever weekday its date falls on, so the day picker
  // only means anything for something that repeats.
  const once = !form.weekly;
  const day = once ? weekdayOf(form.from) : Number(form.day);

  const commit = (action) => {
    if (action !== "drop") {
      if (!form.title.trim()) return setFault("Give the class a name.");
      if (toMin(form.end) <= toMin(form.start)) {
        return setFault("The class has to end after it starts.");
      }
      if (day > 4) return setFault("Classes do not run at the weekend, pick a weekday.");
    }
    onSave({
      id: draft.id,
      ref: draft.ref || newRef(),
      action,
      starts_on: form.from,
      slot: {
        code: form.code.trim().toUpperCase(),
        title: form.title.trim(),
        profs: form.profs.split(",").map((p) => p.trim()).filter(Boolean),
        kind: form.kind,
        room: form.room.trim(),
        day,
        day_name: DAY_NAMES[day],
        start: form.start,
        end: form.end,
        from: form.from,
        weekly: Boolean(form.weekly),
      },
    });
    onClose();
  };

  const submit = (e) => {
    e.preventDefault();
    commit(dropping ? "drop" : "set");
  };

  const title = dropping ? "Class you removed"
    : adding ? "Add a class"
    : isExtra(draft.ref) ? "Your class"
    : "Change this class";

  const dateLabel = dropping ? "Removed from"
    : once ? "Date of the class"
    : "This applies from";

  const note = dropping
    ? `Classes up to ${fmtDate(form.from)} still count towards your attendance.`
    : once
      ? `A one-off on ${fmtDate(form.from)}, counted on that day only.`
      : `Every ${DAY_NAMES[day]} from ${fmtDate(form.from)} onwards. Days before `
        + "that keep the old routine, so attendance you have already marked does "
        + "not move.";

  const fields = (
    <>
      <label className="field wide">
        <span>Class</span>
        <input className="input" value={form.title} onChange={set("title")}
               placeholder="Engineering Mathematics - I" autoFocus />
      </label>

      <label className="field">
        <span>Course code</span>
        <input className="input" value={form.code} onChange={set("code")}
               placeholder="MA1101N" />
      </label>

      <label className="field">
        <span>Type</span>
        <select className="input select" value={form.kind} onChange={set("kind")}>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>

      <label className="field">
        <span>Starts</span>
        <input className="input" type="time" value={form.start} onChange={set("start")} />
      </label>

      <label className="field">
        <span>Ends</span>
        <input className="input" type="time" value={form.end} onChange={set("end")} />
      </label>

      <label className="field">
        <span>Room</span>
        <input className="input" value={form.room} onChange={set("room")}
               placeholder="L102" />
      </label>

      <label className="field">
        <span>Taught by</span>
        <input className="input" value={form.profs} onChange={set("profs")}
               placeholder="Separate names with commas" />
      </label>

      <fieldset className="field wide radios">
        <legend>Repeats</legend>
        <label>
          <input type="radio" name="repeats" checked={!once}
                 onChange={() => setForm((p) => ({ ...p, weekly: true }))} />
          Every week
        </label>
        <label>
          <input type="radio" name="repeats" checked={once}
                 onChange={() => setForm((p) => ({ ...p, weekly: false }))} />
          Just once
        </label>
      </fieldset>

      {once ? null : (
        <label className="field">
          <span>Day</span>
          <select className="input select" value={form.day} onChange={set("day")}>
            {DAYS.map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
          </select>
        </label>
      )}
    </>
  );

  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-scrim" onClick={onClose} />
      <form className="modal" onSubmit={submit}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div className="modal-body">
          {dropping ? (
            <p className="modal-note wide">
              <strong>{form.title}</strong> is off your timetable. Say which date it
              stopped running.
            </p>
          ) : fields}

          <label className="field">
            <span>{dateLabel}</span>
            <input className="input" type="date" value={form.from} onChange={set("from")} />
          </label>

          <p className="modal-note wide">{note}</p>
          {fault ? <p className="modal-fault wide">{fault}</p> : null}
        </div>

        <div className="modal-foot">
          {adding || dropping ? <span /> : (
            <button type="button" className="btn danger" onClick={() => commit("drop")}>
              Remove from {fmtDate(form.from)}
            </button>
          )}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary">
              {dropping ? "Save date" : adding ? "Add class" : "Save change"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
