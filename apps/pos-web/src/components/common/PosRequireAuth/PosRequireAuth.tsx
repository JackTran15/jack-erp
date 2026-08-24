import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { authService } from "@erp/pos/services/auth.service";
import { restoreSessionIfNeeded } from "@erp/pos/components/common/PosSessionHandoff/PosSessionHandoff";

type RestoreState = "idle" | "pending" | "failed";

/**
 * PosSessionHandoff's proactive-refresh check runs once, at app load — it can't see an
 * access token that expires while the tab has stayed open (the normal case for an
 * always-on POS terminal). This guard re-checks on every navigation and attempts the same
 * silent refresh before ever redirecting, so idling past the token's TTL and then clicking
 * around doesn't force a re-login (see ADR-04 in 03-logical-design.md).
 */
export function PosRequireAuth() {
  const location = useLocation();
  // Read fresh on every render, never cached in state -- the common (still-valid) path
  // renders <Outlet /> synchronously below with no extra render cycle or flicker.
  const authenticated = authService.isAuthenticated();
  const [restoreState, setRestoreState] = useState<RestoreState>("idle");
  // In-flight guard lives in a ref, not in `restoreState` -- putting it in state and in the
  // effect's own dependency array caused the effect to re-run (and cancel itself) as soon as
  // `setRestoreState("pending")` committed, always faster than the real /auth/refresh
  // round-trip, leaving the restore permanently stuck at "pending" and the whole route
  // subtree frozen on a blank screen with no recovery short of a hard reload. A ref doesn't
  // trigger a re-run, so the effect only fires again when `authenticated` itself changes.
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (authenticated) {
      inFlightRef.current = false;
      setRestoreState("idle"); // reset so the next time it expires gets its own attempt
      return;
    }
    if (inFlightRef.current) return; // already restoring for this falsy streak
    inFlightRef.current = true;
    setRestoreState("pending");
    let cancelled = false;
    restoreSessionIfNeeded().finally(() => {
      if (cancelled) return;
      inFlightRef.current = false;
      setRestoreState(authService.isAuthenticated() ? "idle" : "failed");
    });
    return () => {
      cancelled = true;
      // Also release the in-flight guard here, not just in .finally() -- StrictMode's
      // dev-only setup->cleanup->setup double-invoke on first mount runs this cleanup
      // synchronously, before the real network call has any chance to resolve. Without
      // this line, the surviving second invocation sees inFlightRef still true and bails,
      // and the torn-down first invocation's .finally() sees cancelled=true and never
      // updates state either -- stuck at "pending" forever, with no restore ever actually
      // attempted. refreshOnce() is already single-flight (token-refresh.ts), so a second
      // attempt this releases can only ever collapse into the same in-flight request, never
      // duplicate it.
      inFlightRef.current = false;
    };
  }, [authenticated]);

  if (authenticated) return <Outlet />;
  if (restoreState === "failed") {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/dang-nhap" replace state={{ from }} />;
  }
  // Idle-about-to-restore, or a restore is in flight: show a brief loading state rather
  // than a premature redirect -- React runs effects after paint, so without this branch the
  // transitional render (token just went invalid) would flash to the login screen before
  // the restore attempt has even started. Same treatment as PosSessionHandoff's own gate.
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-600">
      Đang khôi phục phiên…
    </div>
  );
}
