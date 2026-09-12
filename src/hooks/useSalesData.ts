import { useCallback, useEffect, useState } from "react";
import {
  buildInstructorFreeGrid,
  candidateStartMinutes,
  isInstructorActive,
  type InstructorLike,
  type ScheduleBlock,
} from "../lib/availability";
import { readBookingFlowConfig, type BookingFlowConfig } from "../lib/config";
import { addDaysISO, istTodayISO, timeToMinutes } from "../lib/validation";
import { supabase } from "../lib/supabase";

const PAGE_SIZE = 1000;

export interface InstructorRow {
  id: string;
  name: string;
  areas: string[];
  gender: string | null;
  status: string | null;
  enabled: boolean | null;
  unavailability: unknown[] | null;
}

export interface ScheduleRow {
  id: number;
  instructor_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  learner_id: string | null;
  course_id: string | null;
  leadName: string | null;
  tentative_details: Record<string, unknown> | null;
  pause_reason: string | null;
  pause_notes: string | null;
}

export interface BlockDetail {
  instructorId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  status: string;
  learnerName: string;
  area: string;
  courseName: string;
  notes: string;
}

export interface SalesData {
  config: BookingFlowConfig;
  dates: string[];
  instructors: InstructorRow[];
  freeGrid: Map<string, Map<string, number[]>>;
  timeStarts: number[];
  blocks: BlockDetail[];
}

const EMPTY_GRID = new Map<string, Map<string, number[]>>();

const DEFAULT_VIEW_DAYS_AHEAD = 400;

async function fetchScheduleWindow(
  dateFrom: string,
  dateTo: string,
  excludedStatuses: string[],
): Promise<ScheduleRow[]> {
  const excludeFilter =
    excludedStatuses.length > 0 ? `(${excludedStatuses.join(",")})` : null;
  const rows: ScheduleRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from("Schedule")
      .select(
        "id, instructor_id, date, start_time, end_time, status, learner_id, course_id, leadName, tentative_details, pause_reason, pause_notes",
      )
      .gte("date", dateFrom)
      .lte("date", dateTo);
    if (excludeFilter) query = query.not("status", "in", excludeFilter);
    const { data, error } = await query
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as ScheduleRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function parseInstructors(rows: Record<string, unknown>[]): InstructorRow[] {
  return rows.map((r) => ({
    id: String(r.id_instructor),
    name: String(r.name ?? ""),
    areas: Array.isArray(r.areas) ? (r.areas as string[]).map((a) => String(a)) : [],
    gender: r.gender == null ? null : String(r.gender),
    status: r.status == null ? null : String(r.status),
    enabled: r.enabled == null ? null : Boolean(r.enabled),
    unavailability: r.unavailability == null ? null : (r.unavailability as unknown[]),
  }));
}

export function useSalesData() {
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<SalesData | null>(null);

  const load = useCallback(async () => {
    try {
      const { data: settingRow, error: cfgErr } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "booking_flow")
        .maybeSingle();
      if (cfgErr) throw cfgErr;
      const config = readBookingFlowConfig(settingRow?.value);
      if (!config.enabled) {
        throw new Error("booking_flow configuration is missing or incomplete in app_settings (enabled:false).");
      }

      const from = addDaysISO(istTodayISO(), 1);
      const viewDays = config.view_days_ahead ?? DEFAULT_VIEW_DAYS_AHEAD;
      const to = addDaysISO(from, viewDays - 1);
      const dates: string[] = [];
      for (let d = from; d <= to; d = addDaysISO(d, 1)) dates.push(d);

      const { data: instructorRows, error: instrErr } = await supabase
        .from("Instructor")
        .select("id_instructor, name, areas, gender, unavailability, status, enabled");
      if (instrErr) throw instrErr;

      const scheduleRows = await fetchScheduleWindow(
        from,
        dates[dates.length - 1],
        config.excluded_schedule_statuses ?? ["cancelled", "rejected"],
      );

      const instructorRows2 = (instructorRows ?? []) as Record<string, unknown>[];
      const instructors = parseInstructors(instructorRows2);

      const learnerIds = [
        ...new Set(
          scheduleRows.map((r) => r.learner_id).filter((x): x is string => Boolean(x)),
        ),
      ];
      const courseIds = [
        ...new Set(
          scheduleRows.map((r) => r.course_id).filter((x): x is string => Boolean(x)),
        ),
      ];

      const learnerNames = new Map<string, string>();
      const learnerAreas = new Map<string, string>();
      if (learnerIds.length > 0) {
        const { data: learners, error: learnerErr } = await supabase
          .from("Learner")
          .select("id, name, area")
          .in("id", learnerIds);
        if (learnerErr) throw learnerErr;
        for (const l of (learners ?? []) as Record<string, unknown>[]) {
          learnerNames.set(String(l.id), l.name == null ? "" : String(l.name));
          learnerAreas.set(String(l.id), l.area == null ? "" : String(l.area));
        }
      }

      const courseNames = new Map<string, string>();
      if (courseIds.length > 0) {
        const { data: courses, error: courseErr } = await supabase
          .from("Courses")
          .select("id, name")
          .in("id", courseIds);
        if (courseErr) throw courseErr;
        for (const c of (courses ?? []) as Record<string, unknown>[]) {
          courseNames.set(String(c.id), c.name == null ? "" : String(c.name));
        }
      }

      const str = (v: unknown): string =>
        typeof v === "string" && v.trim().length > 0 ? v : "";

      const blockDetails: BlockDetail[] = scheduleRows.map((r) => {
        const td = (r.tentative_details ?? {}) as Record<string, unknown>;
        const learnerName =
          str(td.name) ||
          str(td.leadName) ||
          str(r.leadName) ||
          (r.learner_id ? (learnerNames.get(r.learner_id) ?? "") : "");
        const area =
          str(td.pickup_location) ||
          str(td.address) ||
          (r.learner_id ? (learnerAreas.get(r.learner_id) ?? "") : "");
        const courseName =
          str(td.description) || (r.course_id ? (courseNames.get(r.course_id) ?? "") : "");
        const notes = r.status === "paused" ? str(r.pause_reason) || str(r.pause_notes) : "";
        return {
          instructorId: r.instructor_id,
          date: r.date,
          startMinute: timeToMinutes(r.start_time),
          endMinute: timeToMinutes(r.end_time),
          status: r.status,
          learnerName,
          area,
          courseName,
          notes,
        };
      });

      const engineInstructors: InstructorLike[] = instructors.map((i) => ({
        id: i.id,
        areas: i.areas,
        radiusKm: null,
        lat: null,
        lng: null,
        gender: i.gender,
        status: i.status,
        enabled: i.enabled,
        unavailability: i.unavailability,
      }));

      const blocks: ScheduleBlock[] = scheduleRows.map((r) => ({
        instructorId: r.instructor_id,
        date: r.date,
        startMinute: timeToMinutes(r.start_time),
        endMinute: timeToMinutes(r.end_time),
        status: r.status,
        // `booking` is RLS-protected (service-role only), so hold creation time
        // can't be read from the browser; pending_payment holds are therefore
        // treated as occupying until the hold-expiry job clears them.
        bookingCreatedAt: null,
        ownerBookingId: null,
      }));

      const activeInstructors = engineInstructors.filter((i) => isInstructorActive(i));

      const freeGrid =
        activeInstructors.length > 0 && dates.length > 0
          ? buildInstructorFreeGrid(
              {
                instructors: engineInstructors,
                learnerArea: "",
                blocks,
                dates,
                slotConfig: {
                  slotStart: config.slotStart,
                  slotEnd: config.slotEnd,
                  gridMinutes: config.gridMinutes,
                  slotDurationMinutes: config.slotDurationMinutes,
                },
                holdMinutes: config.hold_minutes,
                gapMinutes: config.instructor_gap_minutes,
              },
              activeInstructors,
            )
          : EMPTY_GRID;

      const timeStarts = candidateStartMinutes({
        slotStart: config.slotStart,
        slotEnd: config.slotEnd,
        gridMinutes: config.gridMinutes,
        slotDurationMinutes: config.slotDurationMinutes,
      });

      setData({ config, dates, instructors, freeGrid, timeStarts, blocks: blockDetails });
      setPhase("ready");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, []);

  const reload = useCallback(() => {
    setPhase("loading");
    void load();
  }, [load]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- initial data fetch; setState only happens after async awaits
    void load();
  }, [load]);

  return { phase, errorMsg, data, reload };
}