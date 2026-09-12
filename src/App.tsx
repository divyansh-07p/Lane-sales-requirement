import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import "./App.css";
import { useSalesData } from "./hooks/useSalesData";
import type { BlockDetail, InstructorRow } from "./hooks/useSalesData";
import { isTimeUnavailable } from "./lib/availability";
import { dateToWeekdayLower, minutesToTime } from "./lib/validation";

interface SlotInfo {
  title: string;
  detail: string[];
}

type SortKey = "freeDesc" | "freeAsc" | "alpha";

function isBookable(instructor: InstructorRow): boolean {
  return instructor.enabled !== false && (instructor.status ?? "active") === "active";
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function monthLabel(m: string): string {
  const [y, mm] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mm - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

function shortDate(iso: string): { weekday: string; date: string; day: string } {
  const d = new Date(`${iso}T00:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-GB", { weekday: "short" }),
    date: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    day: d.toLocaleDateString("en-GB", { day: "numeric" }),
  };
}

function showDetailTitle(instructor: InstructorRow, windowTotal: number, days: number): string {
  const areas = instructor.areas.length > 0 ? `Areas: ${instructor.areas.join(", ")}` : "";
  return [areas, `${windowTotal} free slots across ${days} days`].filter(Boolean).join(" · ");
}

interface GridProps {
  instructors: InstructorRow[];
  freeGrid: Map<string, Map<string, number[]>>;
  freeSets: Map<string, Set<number>>;
  windowTotals: Map<string, number>;
  timeCols: string[];
  timeStarts: number[];
  dates: string[];
  selectedDate: string;
  gridMinutes: number;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onRemove?: (id: string) => void;
  resolveInfo: (instrId: string, date: string, minute: number, free: boolean) => SlotInfo;
}

interface SlotCellProps {
  free: boolean;
  band: boolean;
  minute: number;
  timeLabel: string;
  isOpen: boolean;
  onSelect: () => void;
  resolve: (minute: number, free: boolean) => SlotInfo;
}

function SlotCell({ free, band, minute, timeLabel, isOpen, onSelect, resolve }: SlotCellProps) {
  const info = isOpen ? resolve(minute, free) : null;
  const cls = [free ? "cell cell-free" : band ? "cell cell-band" : "cell"];
  if (isOpen) cls.push("cell-selected");
  return (
    <td
      className={cls.join(" ")}
      title={free ? `Free ${timeLabel}` : "Click for details"}
      onClick={onSelect}
    >
      {info && (
        <div className="slot-pop">
          <div className={free ? "pop-title free" : "pop-title busy"}>{info.title}</div>
          {info.detail.map((line, i) => (
            <div key={i} className="pop-line">
              {line}
            </div>
          ))}
        </div>
      )}
    </td>
  );
}

function AvailabilityGrid(props: GridProps) {
  const {
    instructors,
    freeGrid,
    freeSets,
    windowTotals,
    timeCols,
    timeStarts,
    dates,
    selectedDate,
    gridMinutes,
    expanded,
    onToggleExpand,
    onRemove,
    resolveInfo,
  } = props;

  const [pop, setPop] = useState<{ instrId: string; date: string; minute: number } | null>(null);
  const selectCell = (instrId: string, date: string, minute: number) =>
    setPop((prev) =>
      prev && prev.instrId === instrId && prev.date === date && prev.minute === minute
        ? null
        : { instrId, date, minute },
    );

  return (
    <table className="grid roster">
      <thead>
        <tr>
          <th className="col-instructor">Instructor</th>
          {timeCols.map((t) => (
            <th key={t} className="col-time-h">
              <span className="time-label">{t}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {instructors.map((instr) => {
          const freeSet = freeSets.get(instr.id);
          const windowTotal = windowTotals.get(instr.id) ?? 0;
          const isOpen = expanded.has(instr.id);
          const detailTitle = showDetailTitle(instr, windowTotal, dates.length);
          return (
            <Fragment key={instr.id}>
              <tr className="row">
                <td className="instructor-cell" title={detailTitle}>
                  <button
                    type="button"
                    className="expand"
                    aria-label={isOpen ? "Collapse slots" : "Show slots for all dates"}
                    title="Show all 14 days for this instructor"
                    onClick={() => onToggleExpand(instr.id)}
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                  <div className="instructor-info">
                    <div className="instructor-name">{instr.name}</div>
                  </div>
                  {onRemove && (
                    <button
                      type="button"
                      className="remove-instr"
                      title={`Remove ${instr.name} from compare`}
                      aria-label={`Remove ${instr.name} from compare`}
                      onClick={() => onRemove(instr.id)}
                    >
                      ×
                    </button>
                  )}
                </td>
                {timeCols.map((t, ti) => {
                  const m = timeStarts[ti];
                  const free = freeSet?.has(m) ?? false;
                  const band = Math.floor(ti / 2) % 2 === 1;
                  const isSel = pop?.instrId === instr.id && pop?.date === selectedDate && pop.minute === m;
                  return (
                    <SlotCell
                      key={t}
                      free={free}
                      band={band}
                      minute={m}
                      timeLabel={`${t}–${minutesToTime(m + gridMinutes)}`}
                      isOpen={isSel}
                      onSelect={() => selectCell(instr.id, selectedDate, m)}
                      resolve={(minute, isFree) => resolveInfo(instr.id, selectedDate, minute, isFree)}
                    />
                  );
                })}
              </tr>
              {isOpen && (
                <tr className="detail-row">
                  <td colSpan={timeCols.length + 1}>
                    <div className="detail">
                      {instr.areas.length > 0 && (
                        <div className="detail-areas">Areas: {instr.areas.join(", ")}</div>
                      )}
                      <table className="mini">
                        <thead>
                          <tr>
                            <th className="mini-date">Date</th>
                            {timeCols.map((t) => (
                              <th key={t} className="mini-time">
                                <span className="time-label">{t}</span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dates.map((d) => {
                            const { weekday, date } = shortDate(d);
                            const dayFree = new Set(freeGrid.get(instr.id)?.get(d) ?? []);
                            return (
                              <tr
                                key={d}
                                className={d === selectedDate ? "mini-row current" : "mini-row"}
                              >
                                <td className="mini-date">
                                  {weekday} {date}
                                  <span className="mini-count">{dayFree.size}</span>
                                </td>
                                {timeCols.map((t, ti) => {
                                  const m = timeStarts[ti];
                                  const free = dayFree.has(m);
                                  const band = Math.floor(ti / 2) % 2 === 1;
                                  const isSel = pop?.instrId === instr.id && pop?.date === d && pop.minute === m;
                                  return (
                                    <SlotCell
                                      key={t}
                                      free={free}
                                      band={band}
                                      minute={m}
                                      timeLabel={`${t}–${minutesToTime(m + gridMinutes)}`}
                                      isOpen={isSel}
                                      onSelect={() => selectCell(instr.id, d, m)}
                                      resolve={(minute, isFree) =>
                                        resolveInfo(instr.id, d, minute, isFree)
                                      }
                                    />
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export default function App() {
  const { phase, errorMsg, data, reload } = useSalesData();
  const [filter, setFilter] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [dateIndex, setDateIndex] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("freeDesc");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const searchRef = useRef<HTMLDivElement>(null);

  const config = data?.config ?? null;
  const dates = useMemo(() => data?.dates ?? [], [data]);
  const freeGrid = useMemo(
    () => data?.freeGrid ?? new Map<string, Map<string, number[]>>(),
    [data],
  );
  const timeStarts = data?.timeStarts ?? [];

  const months = useMemo(() => {
    const out: string[] = [];
    for (const d of dates) {
      const m = d.slice(0, 7);
      if (out[out.length - 1] !== m) out.push(m);
    }
    return out;
  }, [dates]);
  const activeMonth = months.includes(selectedMonth) ? selectedMonth : (months[0] ?? "");
  const monthIdx = months.indexOf(activeMonth);
  const goToday = () => {
    setSelectedMonth(months[0] ?? "");
    setDateIndex(0);
  };
  const goPrev = () => {
    if (monthIdx > 0) {
      setSelectedMonth(months[monthIdx - 1]);
      setDateIndex(0);
    }
  };
  const goNext = () => {
    if (monthIdx < months.length - 1) {
      setSelectedMonth(months[monthIdx + 1]);
      setDateIndex(0);
    }
  };
  const visibleDates = useMemo(
    () => dates.filter((d) => d.startsWith(activeMonth)),
    [dates, activeMonth],
  );

  const safeDateIndex = Math.min(dateIndex, Math.max(0, visibleDates.length - 1));
  const selectedDate = visibleDates[safeDateIndex] ?? null;

  useOutsideClick(searchRef, () => setSearchOpen(false));

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addToCompare = (id: string) => {
    setCompareIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setSearchOpen(false);
  };

  const removeFromCompare = (id: string) => {
    setCompareIds((prev) => prev.filter((x) => x !== id));
  };

  const visibleInstructors = useMemo(() => {
    const roster = data?.instructors ?? [];
    const q = filter.trim().toLowerCase();
    return roster
      .filter((i) => isBookable(i))
      .filter((i) => (q ? i.name.toLowerCase().includes(q) : true));
  }, [data, filter]);

  const searchResults = useMemo(() => {
    const roster = data?.instructors ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return [];
    return roster.filter((i) => isBookable(i) && i.name.toLowerCase().includes(q)).slice(0, 8);
  }, [data, filter]);

  const compareInstructors = useMemo(() => {
    if (!data) return [];
    return compareIds
      .map((id) => data.instructors.find((i) => i.id === id))
      .filter((i): i is InstructorRow => Boolean(i));
  }, [data, compareIds]);
  const inSelectionMode = compareIds.length > 0;

  const freeSets = useMemo(() => {
    const map = new Map<string, Set<number>>();
    if (!selectedDate || !data) return map;
    for (const instr of data.instructors) {
      if (!isBookable(instr)) continue;
      map.set(instr.id, new Set(data.freeGrid.get(instr.id)?.get(selectedDate) ?? []));
    }
    return map;
  }, [data, selectedDate]);

  const windowTotals = useMemo(() => {
    const map = new Map<string, number>();
    if (!data) return map;
    for (const instr of data.instructors) {
      if (!isBookable(instr)) continue;
      const instrDates = data.freeGrid.get(instr.id);
      let total = 0;
      for (const d of data.dates) total += instrDates?.get(d)?.length ?? 0;
      map.set(instr.id, total);
    }
    return map;
  }, [data]);

  const dateTotals = useMemo(() => {
    const map = new Map<string, number>();
    if (!data) return map;
    for (const d of data.dates) {
      let total = 0;
      for (const instr of data.instructors) {
        if (!isBookable(instr)) continue;
        total += data.freeGrid.get(instr.id)?.get(d)?.length ?? 0;
      }
      map.set(d, total);
    }
    return map;
  }, [data]);

  const sortRoster = useCallback(
    (list: InstructorRow[]): InstructorRow[] => {
      const freeCount = (i: InstructorRow) => freeSets.get(i.id)?.size ?? 0;
      switch (sort) {
        case "alpha":
          return [...list].sort((a, b) => a.name.localeCompare(b.name));
        case "freeAsc":
          return [...list].sort(
            (a, b) => freeCount(a) - freeCount(b) || a.name.localeCompare(b.name),
          );
        default:
          return [...list].sort(
            (a, b) => freeCount(b) - freeCount(a) || a.name.localeCompare(b.name),
          );
      }
    },
    [sort, freeSets],
  );

  const rows = useMemo(() => {
    return sortRoster(visibleInstructors);
  }, [visibleInstructors, sortRoster]);

  const instructorsById = useMemo(() => {
    const map = new Map<string, InstructorRow>();
    if (!data) return map;
    for (const i of data.instructors) map.set(i.id, i);
    return map;
  }, [data]);

  const blocksIndex = useMemo(() => {
    const map = new Map<string, Map<string, BlockDetail[]>>();
    if (!data) return map;
    for (const b of data.blocks) {
      let perDate = map.get(b.instructorId);
      if (!perDate) {
        perDate = new Map<string, BlockDetail[]>();
        map.set(b.instructorId, perDate);
      }
      const list = perDate.get(b.date) ?? [];
      list.push(b);
      perDate.set(b.date, list);
    }
    return map;
  }, [data]);

  const resolveInfo = useMemo(() => {
    const gap = config?.instructor_gap_minutes ?? 0;
    const g = Math.max(0, Math.floor(gap));
    return (instrId: string, date: string, minute: number, free: boolean): SlotInfo => {
      const instr = instructorsById.get(instrId);
      const name = instr?.name ?? "";
      const timeLabel = `${minutesToTime(minute)}–${minutesToTime(minute + (config?.gridMinutes ?? 30))}`;

      const unavail = (instr?.unavailability ?? null) as unknown[] | null | undefined;
      const weekday = dateToWeekdayLower(date);
      const blockedByUnavail =
        unavail != null &&
        isTimeUnavailable(unavail, date, weekday, minute);
      const unavailReason = () => {
        if (!Array.isArray(unavail)) return "";
        for (const u of unavail) {
          if (!isTimeUnavailable([u], date, weekday, minute)) continue;
          const r = (u as Record<string, unknown>)?.reason;
          if (typeof r === "string" && r.trim()) return r.trim();
        }
        return "";
      };

      if (free) {
        return {
          title: "Free",
          detail: [timeLabel, `Instructor: ${name}`],
        };
      }

      const blocks = blocksIndex.get(instrId)?.get(date) ?? [];
      let cover: BlockDetail | null = null;
      for (const b of blocks) {
        if (b.status === "cancelled" || b.status === "rejected") continue;
        if (b.startMinute - g < minute + 1 && minute < b.endMinute + g) {
          cover = b;
          break;
        }
      }

      if (cover) {
        const blockTime = `${minutesToTime(cover.startMinute)}–${minutesToTime(cover.endMinute)}`;
        if (cover.status === "booked" || cover.status === "completed") {
          const detail = [blockTime, `Instructor: ${name}`];
          if (cover.learnerName) detail.push(`Learner: ${cover.learnerName}`);
          if (cover.area) detail.push(`Area: ${cover.area}`);
          if (cover.courseName) detail.push(`Course: ${cover.courseName}`);
          return {
            title: cover.status === "booked" ? "Booked class" : "Completed class",
            detail,
          };
        }
        if (cover.status === "pending_payment" || cover.status === "hold") {
          return {
            title: "Payment pending",
            detail: [blockTime, `Instructor: ${name}`, "Slot is on hold until payment completes."],
          };
        }
        if (cover.status === "paused") {
          return {
            title: "Paused",
            detail: [blockTime, `Instructor: ${name}`, ...(cover.notes ? [`Reason: ${cover.notes}`] : [])],
          };
        }
        return {
          title: cap(cover.status),
          detail: [blockTime, `Instructor: ${name}`],
        };
      }

      if (blockedByUnavail) {
        return {
          title: "Unavailable",
          detail: [timeLabel, `Instructor: ${name}`, ...(unavailReason() ? [`Reason: ${unavailReason()}`] : ["Instructor marked this time unavailable."])],
        };
      }

      return { title: "Busy", detail: [timeLabel, `Instructor: ${name}`] };
    };
  }, [config, instructorsById, blocksIndex]);

  const gridRows = useMemo(() => {
    if (compareIds.length === 0) return rows;
    return sortRoster(compareInstructors);
  }, [compareIds, compareInstructors, rows, sortRoster]);

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchResults.length > 0) addToCompare(searchResults[0].id);
    if (e.key === "Escape") {
      setSearchOpen(false);
      setFilter("");
    }
  };

  if (phase === "loading") {
    return (
      <main className="shell">
        <p className="state">Loading availability from the database…</p>
      </main>
    );
  }

  if (phase === "error" || !data) {
    return (
      <main className="shell">
        <div className="state error">
          <p>Couldn&apos;t load availability: {errorMsg ?? "unknown error"}</p>
          <button type="button" onClick={() => void reload()}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!config) return null;

  const selectedTotal = dateTotals.get(selectedDate) ?? 0;

  const fromLabel = shortDate(dates[0]);
  const toLabel = shortDate(dates[dates.length - 1]);
  const timeCols = timeStarts.map((m) => minutesToTime(m));

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <h1>
            <span className="brand-dot" /> Instructor availability
          </h1>
        </div>

        <div className="cal-nav">
          <button type="button" className="cal-btn today" onClick={goToday}>
            Today
          </button>
          <button
            type="button"
            className="cal-btn chev"
            onClick={goPrev}
            disabled={monthIdx <= 0}
            aria-label="Previous month"
          >
            ‹
          </button>
          <div className="cal-month">{monthLabel(activeMonth)}</div>
          <button
            type="button"
            className="cal-btn chev"
            onClick={goNext}
            disabled={monthIdx >= months.length - 1}
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        <div className="controls">
          <div className="controls-row">
            <select
              className="sort-select"
              value={activeMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setDateIndex(0);
              }}
              aria-label="Select month"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>

            <select
              className="sort-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort instructors"
            >
              <option value="freeDesc">Filter (Most free slots)</option>
              <option value="freeAsc">Filter (Least free slots)</option>
              <option value="alpha">Filter (A → Z)</option>
            </select>

            <div className="search" ref={searchRef}>
              <input
                type="search"
                placeholder="Search or compare instructors…"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={onSearchKeyDown}
                aria-label="Search instructors by name"
              />
{searchOpen && searchResults.length > 0 && (
                <ul className="suggest">
                  {searchResults.map((instr) => {
                    const added = compareIds.includes(instr.id);
                    return (
                      <li
                        key={instr.id}
                        className={added ? "suggest-row added" : "suggest-row"}
                        onMouseDown={() =>
                          added ? removeFromCompare(instr.id) : addToCompare(instr.id)
                        }
                      >
                        <span className="suggest-name">{instr.name}</span>
                        <span className="suggest-btn">{added ? "✓ Added" : "＋ Compare"}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              </div>
            </div>
          </div>
        </header>

      <div className="summary">
        {inSelectionMode ? (
          <>
            Comparing <strong>{gridRows.length}</strong> instructor
            {gridRows.length === 1 ? "" : "s"} · <strong>{selectedTotal}</strong> free slots on{" "}
            {fromLabel.weekday} {fromLabel.date}
            <button
              type="button"
              className="clear-select"
              onClick={() => setCompareIds([])}
            >
              Clear selection
            </button>
          </>
        ) : (
          <>
            <strong>{rows.length}</strong> instructor{rows.length === 1 ? "" : "s"} shown ·{" "}
            <strong>{selectedTotal}</strong> free slots ·{" "}
            {fromLabel.weekday} {fromLabel.date} → {toLabel.weekday} {toLabel.date} window
          </>
        )}
      </div>

      <nav className="tabs" aria-label="Select date">
        {visibleDates.map((d, i) => {
          const { weekday, day } = shortDate(d);
          const total = dateTotals.get(d) ?? 0;
          return (
            <button
              type="button"
              key={d}
              className={i === safeDateIndex ? "tab active" : "tab"}
              onClick={() => setDateIndex(i)}
            >
              <span>{weekday}</span>
              <strong>{day}</strong>
              <em>{total} free</em>
            </button>
          );
        })}
      </nav>

      <div className="grid-wrap">
        <AvailabilityGrid
          instructors={gridRows}
          freeGrid={freeGrid}
          freeSets={freeSets}
          windowTotals={windowTotals}
          timeCols={timeCols}
          timeStarts={timeStarts}
          dates={dates}
selectedDate={selectedDate}
          gridMinutes={config.gridMinutes}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          resolveInfo={resolveInfo}
        />
        {gridRows.length === 0 && (
          <p className="empty">No instructors match. Clear the search filter.</p>
        )}
      </div>

      <footer className="legend">
        <span>
          <i className="swatch free" /> Free slot (no class, not on unavailability, outside the{" "}
          {config.instructor_gap_minutes}-minute travel gap)
        </span>
        <span>
          <i className="swatch busy" /> Busy / booked
        </span>
        <button type="button" className="reload" onClick={() => void reload()}>
          Refresh
        </button>
      </footer>
    </main>
  );
}

function useOutsideClick(ref: RefObject<HTMLDivElement | null>, onOutside: () => void) {
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [ref, onOutside]);
}