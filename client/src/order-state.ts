export type StateView = {
  folio: string;
  state: string;
  orderVersion: number;
  changedAt: string;
  changedBy: string;
  allowedTransitions: string[];
  blockedReason: string;
  canCancel: boolean;
  authorizationRecorded: boolean;
  history: { previousState: string | null; state: string; note: string; changedAt: string; author: string }[];
};
