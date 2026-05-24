// App-wide state — session, plan, scans left
// Passed down as props (no Context API complexity)

export interface AppState {
  session: { access_token: string; refresh_token: string; user: any } | null;
  plan: string;
  scansLeft: number | null;
  setScansLeft: (n: number | null) => void;
  onLogout: () => void;
}
