/** SeatSidekick GET /api/match/{performanceId} response (subset used by poll). */

export type SeatsidekickSeat = {
  seatId: number | string;
  row: string;
  seatNumber: string;
  category: string;
  youPay: number;
  accessible?: boolean;
  bucket?: string;
  displayCategory?: string;
  categoryNum?: string;
};

export type SeatsidekickBlock = {
  blockId: string;
  block: string;
  area: string;
  cat?: string;
  seats: SeatsidekickSeat[];
};

export type SeatsidekickMatchMeta = {
  performance_id?: number;
  match_number?: number;
  matchup?: string;
  home_team?: string;
  away_team?: string;
  venue?: string;
  stage?: string;
};

export type SeatsidekickMatchResponse = {
  performanceId: number | string;
  match?: SeatsidekickMatchMeta;
  overall?: {
    seatCount?: number;
    minPrice?: number;
    maxPrice?: number;
    medianPrice?: number;
  };
  blocks?: SeatsidekickBlock[];
};

export type SeatsidekickSnapshotSeat = {
  blockName: string;
  row: string;
  seatNumber: string;
  categoryName: string;
  /** USD dollars from SeatSidekick youPay. */
  youPay: number;
};

export type SeatsidekickPollSnapshot = {
  performanceId: string;
  matchNum: number | null;
  /** Full inventory (new-listing diff mode). */
  seats: Record<string, SeatsidekickSnapshotSeat>;
  /** Fingerprint of last successfully posted top-N lowest listings. */
  lastPostedTopFingerprint?: string;
  updatedAt: string;
};
