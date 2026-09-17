import { useState } from "react";
import Icon from "../components/Icon.jsx";
import SlotForm from "../components/SlotForm.jsx";
import Gate, { Alert } from "../components/Gate.jsx";
import { DAY_NAMES } from "../lib/calendar.js";
import { describe, refOf } from "../lib/timetable.js";
import { addDays, fmtDate, isoDate, toMin, weekdayOf } from "../lib/util.js";
import { useNow } from "../lib/useNow.js";

const LUNCH = { start: "12:40", end: "13:50" };
const DAYS = [0, 1, 2, 3, 4];
const FALLBACK = { start: "09:00", end: "16:35" };

const mondayOf = (iso) => addDays(iso, -weekdayOf(iso));

function label(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

// Sort by start, then spread overlapping classes across side-by-side tracks so
// nothing gets hidden behind a parallel elective.
function layout(items) {
  const sorted = items
    .map((s) => ({ slot: s, from: toMin(s.start), to: toMin(s.end) }))
    .sort((a, b) => a.from - b.from || b.to - a.to);

  const placed = [];
  let cluster = [];
  let tracks = [];

  const flush = () => {
    const lanes = tracks.length || 1;
    for (const it of cluster) placed.push({ ...it, lanes });
    cluster = [];
    tracks = [];
  };

  for (const it of sorted) {
    if (tracks.length && it.from >= Math.max(...tracks)) flush();
    let lane = tracks.findIndex((end) => end <= it.from);
    if (lane < 0) {
      lane = tracks.length;
      tracks.push(it.to);
    } else {
      tracks[lane] = it.to;
    }
    cluster.push({ ...it, lane });
  }
  flush();
  return placed;
}

function when(edit) {
  const slot = edit.slot || {};
  if (edit.action === "drop") {
    return `off your timetable from ${fmtDate(edit.starts_on)}`;
  }
  const day = DAY_NAMES[slot.day] || "";
  const repeat = slot.weekly === false ? `on ${day}` : `every ${day}`;
  return `${repeat}, ${slot.start} to ${slot.end}, from ${fmtDate(edit.starts_on)}`;
}

// Every change a student has made, newest first.
function Changes({ edits, onEdit }) {
  const list = [...edits.list].sort((a, b) =>
    b.starts_on.localeCompare(a.starts_on) ||
    String(b.saved_at || "").localeCompare(String(a.saved_at || "")));

  if (!list.length) {
    return (
      <p className="wk-changes-none dim tiny">
        Nothing changed yet. Your timetable is exactly as the department published it.
      </p>
    );
  }
  return (
    <ul className="wk-changes">
      {list.map((e) => {
        const what = describe(e, edits.list);
        return (
          <li key={e.id}>
            <span className={`chg-tag ${what.toLowerCase()}`}>{what}</span>
            <span className="chg-what">
              <strong>{(e.slot || {}).title || "Class"}</strong>
              <span className="dim tiny">{when(e)}</span>
            </span>
            <span className="chg-acts">
              <button type="button" className="linkish" onClick={() => onEdit(e)}>Edit</button>
              <button type="button" className="linkish"
                      onClick={() => edits.remove(e.id)}>Undo</button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function Weekly({ att, onFaculty }) {
  const now = useNow();
  const todayIso = isoDate(now);
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayIso));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);

  const table = att.table;
  const thisWeek = weekStart === mondayOf(todayIso);

  // Resolved one weekday at a time rather than once for the whole week, because
  // a change can take effect on the Wednesday and a one-off only exists on a date.
  const columns = DAYS.map((day) => {
    const iso = addDays(weekStart, day);
    return {
      day,
      iso,
      items: att.slotsOn(iso)
        .filter((s) => s.day === day && (s.weekly !== false || s.from === iso)),
    };
  });
  const slots = columns.flatMap((c) => c.items);

  const opens = slots.map((s) => toMin(s.start));
  const closes = slots.map((s) => toMin(s.end));
  const dayStart = opens.length ? Math.min(...opens) : toMin(FALLBACK.start);
  const dayEnd = closes.length ? Math.max(...closes) : toMin(FALLBACK.end);

  const top = Math.floor(dayStart / 60) * 60;
  const bottom = Math.max(dayEnd, top + 60);
  const span = bottom - top;
  const at = (min) => `${((min - top) / span) * 100}%`;
  const tall = (mins) => `${(mins / span) * 100}%`;

  const ticks = [];
  for (let t = top + 60; t < bottom; t += 60) ticks.push(t);

  const today = (now.getDay() + 6) % 7;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const onGrid = thisWeek && DAYS.includes(today) && nowMin >= top && nowMin <= bottom;

  const lunchFrom = Math.max(toMin(LUNCH.start), top);
  const lunchTo = Math.min(toMin(LUNCH.end), bottom);
  const hasLunch = lunchTo > lunchFrom;

  // Never default a change to a date that is already behind us; the field
  // itself still lets a student backdate one deliberately.
  const notBefore = (iso) => (iso > todayIso ? iso : todayIso);
  const addOn = (day) => setDraft({
    slot: { day, start: "09:00", end: "09:55" },
    from: notBefore(addDays(weekStart, day)),
  });
  const change = (slot) => setDraft({ ref: refOf(slot), slot, from: todayIso });
  const revise = (edit) => setDraft({
    id: edit.id, ref: edit.ref, action: edit.action,
    slot: edit.slot, from: edit.starts_on,
  });

  return (
    <section className="view">
      <div className="page-head">
        <h1>Weekly Schedule</h1>
        <p className="sub">
          {table ? `${table.department}, ${table.dept} ${table.year}` : ""}
        </p>
      </div>
      {att.error ? <Alert title="Attendance problem. " detail={att.error.message} /> : null}
      {att.edits.error ? (
        <Alert title="Your timetable changes are not saving. "
               detail={att.edits.error.message} />
      ) : null}
      <Gate who={att.who} table={att.table} parts={att.parts}>
        <div className="card-plain">
          <div className="wk-bar">
            <div className="wk-weeks">
              <button className="icon-btn" aria-label="Previous week"
                      onClick={() => setWeekStart(addDays(weekStart, -7))}>&#8249;</button>
              <span className="wk-week">
                {thisWeek ? "This week" : `Week of ${fmtDate(weekStart)}`}
              </span>
              <button className="icon-btn" aria-label="Next week"
                      onClick={() => setWeekStart(addDays(weekStart, 7))}>&#8250;</button>
              {thisWeek ? null : (
                <button className="btn small"
                        onClick={() => setWeekStart(mondayOf(todayIso))}>Today</button>
              )}
            </div>
            <button className={`btn big${editing ? "" : " primary"}`}
                    aria-pressed={editing} onClick={() => setEditing(!editing)}>
              <Icon name={editing ? "check" : "edit"} />
              {editing ? "Done editing" : "Edit my timetable"}
            </button>
          </div>

          {editing ? (
            <div className="wk-editing">
              <p>
                Pick any class to move, rename or take it off, and say which date the
                change started on. Everything before that date stays as it was, so
                attendance you have already marked does not shift.
              </p>
              <button className="btn primary" onClick={() => addOn(today > 4 ? 0 : today)}>
                <Icon name="plus" />Add a class
              </button>
              <Changes edits={att.edits} onEdit={revise} />
            </div>
          ) : null}

          <div className="wk-meta">
            <span>{label(dayStart)} to {label(dayEnd)}</span>
            <span className="dim">Lunch {label(toMin(LUNCH.start))} to {label(toMin(LUNCH.end))}</span>
          </div>
          <div className={`wk-cal${editing ? " editing" : ""}`}>
            <div className="wk-corner" />
            {columns.map(({ day }) => (
              <div className={`wk-head${thisWeek && day === today ? " today" : ""}`}
                   key={`head-${day}`}>
                <span className="wk-day-long">{DAY_NAMES[day]}</span>
                <span className="wk-day-short">{DAY_NAMES[day].slice(0, 3)}</span>
                {editing ? (
                  <button className="wk-add" onClick={() => addOn(day)}
                          aria-label={`Add a class on ${DAY_NAMES[day]}`}>
                    <Icon name="plus" />
                  </button>
                ) : null}
              </div>
            ))}

            <div className="wk-gutter">
              <span className="wk-tick first" style={{ top: at(top) }}>{label(top)}</span>
              {ticks.map((t) => (
                <span className="wk-tick" style={{ top: at(t) }} key={t}>{label(t)}</span>
              ))}
              <span className="wk-tick last" style={{ top: at(bottom) }}>{label(bottom)}</span>
            </div>

            {columns.map(({ day, items: onDay }) => {
              const items = layout(onDay);
              return (
                <div className={`wk-col${thisWeek && day === today ? " today" : ""}`} key={day}>
                  {ticks.map((t) => (
                    <i className="wk-rule" style={{ top: at(t) }} key={t} />
                  ))}
                  {onGrid && day === today ? (
                    <div className="wk-now" style={{ top: at(nowMin) }} aria-hidden="true" />
                  ) : null}
                  {hasLunch ? (
                    <div
                      className="wk-lunch"
                      style={{ top: at(lunchFrom), height: tall(lunchTo - lunchFrom) }}
                    >
                      <span>Lunch</span>
                    </div>
                  ) : null}

                  {items.length ? items.map(({ slot: s, from, to, lane, lanes }, i) => {
                    const mins = to - from;
                    const size = mins < 70 ? "short" : mins < 110 ? "mid" : "long";
                    return (
                      <article
                        className={`wk-item ${s.kind.toLowerCase()} ${size}${s.mine ? " mine" : ""}`}
                        key={`${refOf(s)}-${i}`}
                        style={{
                          top: at(from),
                          height: tall(mins),
                          left: `calc(${(lane / lanes) * 100}% + 1px)`,
                          width: `calc(${(1 / lanes) * 100}% - 2px)`,
                        }}
                      >
                        <div className="wk-name">{s.title}</div>
                        <div className="wk-code">{s.code}</div>
                        <div className="wk-foot">
                          <span className="wk-time">{s.start} - {s.end}</span>
                          {s.room ? <span className="wk-room">{s.room}</span> : null}
                        </div>
                        {(s.profs || []).length ? (
                          <div className="wk-profs">
                            {s.profs.map((p, n) => (
                              <span key={p}>
                                {n ? ", " : ""}
                                <button className="linkish" onClick={() => onFaculty(p)}>{p}</button>
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {editing ? (
                          <button className="wk-hit" onClick={() => change(s)}
                                  aria-label={`Change ${s.title}`} />
                        ) : null}
                      </article>
                    );
                  }) : <p className="wk-none dim tiny">No classes</p>}
                </div>
              );
            })}
          </div>
        </div>
      </Gate>
      {draft ? (
        <SlotForm draft={draft} onClose={() => setDraft(null)} onSave={att.edits.save} />
      ) : null}
    </section>
  );
}
