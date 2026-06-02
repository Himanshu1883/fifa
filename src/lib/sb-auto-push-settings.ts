import { DEFAULT_SB_TICKET_TYPE_ID, parseSbTicketTypeId } from "@/lib/sb-ticket-types";
import { prisma } from "@/lib/prisma";

const SB_AUTO_PUSH_SETTINGS_ID = 1;

export async function getSbAutoPushSettings(): Promise<{ enabled: boolean; ticketType: string }> {
  const row = await prisma.sbAutoPushSettings.findUnique({
    where: { id: SB_AUTO_PUSH_SETTINGS_ID },
    select: { enabled: true, ticketType: true },
  });
  return {
    enabled: row?.enabled ?? false,
    ticketType: parseSbTicketTypeId(row?.ticketType ?? DEFAULT_SB_TICKET_TYPE_ID),
  };
}

export async function getSbAutoPushEnabled(): Promise<boolean> {
  const { enabled } = await getSbAutoPushSettings();
  return enabled;
}

export async function getSbAutoPushTicketType(): Promise<string> {
  const { ticketType } = await getSbAutoPushSettings();
  return ticketType;
}

export async function setSbAutoPushEnabled(enabled: boolean): Promise<void> {
  await prisma.sbAutoPushSettings.upsert({
    where: { id: SB_AUTO_PUSH_SETTINGS_ID },
    create: { id: SB_AUTO_PUSH_SETTINGS_ID, enabled, ticketType: DEFAULT_SB_TICKET_TYPE_ID },
    update: { enabled },
  });
}

export async function setSbAutoPushTicketType(ticketType: string): Promise<void> {
  const parsed = parseSbTicketTypeId(ticketType);
  await prisma.sbAutoPushSettings.upsert({
    where: { id: SB_AUTO_PUSH_SETTINGS_ID },
    create: { id: SB_AUTO_PUSH_SETTINGS_ID, enabled: false, ticketType: parsed },
    update: { ticketType: parsed },
  });
}

export async function registerEventForSbAutoPush(eventId: number): Promise<void> {
  await prisma.sbEventAutoPush.upsert({
    where: { eventId },
    create: { eventId },
    update: {},
  });
}

export async function isEventRegisteredForSbAutoPush(eventId: number): Promise<boolean> {
  const row = await prisma.sbEventAutoPush.findUnique({
    where: { eventId },
    select: { eventId: true },
  });
  return row != null;
}

export async function touchEventLastAutoPush(eventId: number): Promise<void> {
  await prisma.sbEventAutoPush.updateMany({
    where: { eventId },
    data: { lastAutoPushAt: new Date() },
  });
}

/** Events registered after at least one successful manual push. */
export async function listRegisteredSbAutoPushEventIds(): Promise<number[]> {
  const rows = await prisma.sbEventAutoPush.findMany({
    select: { eventId: true },
    orderBy: { eventId: "asc" },
  });
  return rows.map((r) => r.eventId);
}
