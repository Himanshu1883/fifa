/** SeatsBrokers `ticket_type` values for POST ticket/create. */
export const SB_TICKET_TYPES = [
  { id: "5", name: "Local Delivery" },
  { id: "6", name: "External Transfer" },
  { id: "1", name: "Season card" },
  { id: "3", name: "Paper Ticket" },
  { id: "2", name: "E-Ticket" },
  { id: "4", name: "Mobile Ticket" },
] as const;

export const DEFAULT_SB_TICKET_TYPE_ID = "4";

const VALID_IDS = new Set<string>(SB_TICKET_TYPES.map((t) => t.id));

export function parseSbTicketTypeId(raw: string | null | undefined): string {
  const t = raw?.trim();
  if (t && VALID_IDS.has(t)) return t;
  return DEFAULT_SB_TICKET_TYPE_ID;
}

export function sbTicketTypeLabel(id: string): string {
  return SB_TICKET_TYPES.find((t) => t.id === id)?.name ?? `Type ${id}`;
}
