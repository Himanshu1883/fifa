export type SbPushSuccessResult = {
  sbTicketId: string | null;
  logId?: number;
  httpStatus?: number;
  listingFingerprint: string;
  fields?: Record<string, string>;
  response?: unknown;
  blockName?: string | null;
  row?: string | null;
  seatNumbers?: string[];
};
