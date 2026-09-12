// Shared data-access helpers for the booking edge functions.
//
// The unbounded window fetch is paginated (offset/range) so occupancy is never
// silently truncated by the PostgREST row cap. Deterministic `order("id")` keeps
// every invocation reading the SAME row set in the SAME order.

export interface ScheduleWindowRow {
  id: number;
  instructor_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  booking_id?: string | null;
  booking?: { created_at?: string } | null;
}

const PAGE_SIZE = 1000;

export async function fetchAllScheduleWindow(
  client: any,
  dateFrom: string,
  dateTo: string,
): Promise<ScheduleWindowRow[]> {
  const rows: ScheduleWindowRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("Schedule")
      .select("id, instructor_id, date, start_time, end_time, status, booking_id, booking:booking_id(created_at)")
      .not("status", "in", "(cancelled,rejected)")
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as ScheduleWindowRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}