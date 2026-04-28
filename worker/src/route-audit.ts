import type { AuthContext, Env } from "./types";
import { logApiRequest } from "./services/auth";
import { jsonResponse } from "./utils";

type RouteAuditHandler = (
  env: Env,
  routeHandler: () => Promise<Response>,
  auth: AuthContext | null,
  path: string,
  method: string,
  startTime: number,
  ipAddress: string,
  userAgent: string,
  requestSize: number
) => Promise<Response>;

declare global {
  var handleRouteWithAuditLog: RouteAuditHandler;
}

const routeAuditHandler: RouteAuditHandler = async (
  env,
  routeHandler,
  auth,
  path,
  method,
  startTime,
  ipAddress,
  userAgent,
  requestSize
) => {
  try {
    const response = await routeHandler();
    const durationMs = Date.now() - startTime;
    let responseSize = 0;

    try {
      const bodyText = await response.clone().text();
      responseSize = bodyText.length;
    } catch {
      responseSize = 0;
    }

    await logApiRequest(
      env,
      auth?.userId || null,
      auth?.apiKeyId || null,
      path,
      method,
      response.status || 200,
      ipAddress,
      userAgent,
      requestSize,
      responseSize,
      durationMs,
      null
    );

    return response;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Internal server error";
    const durationMs = Date.now() - startTime;

    await logApiRequest(
      env,
      auth?.userId || null,
      auth?.apiKeyId || null,
      path,
      method,
      500,
      ipAddress,
      userAgent,
      requestSize,
      0,
      durationMs,
      errorMsg
    );

    return jsonResponse({ success: false, error: errorMsg }, 500);
  }
};

globalThis.handleRouteWithAuditLog = routeAuditHandler;

export {};
