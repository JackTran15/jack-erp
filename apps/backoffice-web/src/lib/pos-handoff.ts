import type { CreateHandoffResponse } from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "./erp-api";
import { getActiveBranch } from "./auth-storage";
import { resolvePosWebUrl } from "./pos-url";

/**
 * URL that opens POS already signed in as the current user, on the branch the
 * backoffice is looking at.
 *
 * The two SPAs sit on different origins, so POS cannot read the backoffice
 * `localStorage`. Passing the refresh token would also be self-defeating —
 * `/auth/refresh` rotates and revokes the old session, logging the backoffice
 * out. Instead the API mints a single-use code (60s) that POS redeems for its
 * own independent session.
 *
 * Falls back to the plain POS URL (i.e. the login screen) when the code cannot
 * be minted: a failed handoff must not leave the user with nowhere to click.
 */
export async function buildPosLaunchUrl(): Promise<string> {
  const posUrl = resolvePosWebUrl();
  if (!posUrl) return "";

  const branchId = getActiveBranch();
  const params = new URLSearchParams();
  if (branchId) {
    params.set("branchId", branchId);
  }

  try {
    const { code } = requireErpData(
      await erpApi.POST<CreateHandoffResponse>("/auth/handoff", {
        body: branchId ? { branchId } : {},
      }),
    );
    params.set("handoff", code);
  } catch {
    // Session already gone, or the API is down — POS will ask for a login.
  }

  const query = params.toString();
  return query ? `${posUrl}/?${query}` : posUrl;
}
