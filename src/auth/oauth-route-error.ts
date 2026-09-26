import { isTransientOAuthInfrastructureError } from "./oauth-request-lock";
import { UpstreamResponseTooLargeError } from "@/lib/bounded-json";

const TRANSIENT_OAUTH_MESSAGE = "OAuth is temporarily unavailable. Please try again shortly.";

export function classifyOAuthRouteError(error: unknown, fallbackMessage: string): {
  message: string;
  status: 400 | 502 | 503;
  retryAfterSeconds?: number;
} {
  if (isTransientOAuthInfrastructureError(error)) {
    return { message: TRANSIENT_OAUTH_MESSAGE, status: 503, retryAfterSeconds: 5 };
  }
  if (error instanceof UpstreamResponseTooLargeError) {
    return { message: "An upstream service returned a response larger than the configured limit.", status: 502 };
  }
  return {
    message: error instanceof Error ? error.message : fallbackMessage,
    status: 400,
  };
}
