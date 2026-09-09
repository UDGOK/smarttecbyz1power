/**
 * Inquiry delivery.
 *
 * Both forms on this site used to report success without sending anything.
 * The capture bar ran a 620 ms timer and then wore a "sent" state; the contact
 * page displayed a thank-you and reset the fields. Neither had an endpoint.
 * The handoff calls those simulated-success paths a defect rather than an
 * editorial problem, and it is right: a visitor who typed a real inquiry was
 * told it had been received and it had not.
 *
 * So this module is the only way either form reports success, and it can only
 * do that on an actual acknowledgment from a server. When no endpoint is
 * configured it says so plainly and — critically — the caller keeps every
 * field the visitor typed, because the one thing worse than a failed send is a
 * failed send that also throws the message away.
 *
 * Set PUBLIC_RESERVE_ENDPOINT to any URL that accepts a JSON POST.
 */

export type InquiryFailure = 'unconfigured' | 'rejected' | 'network';

export interface InquiryResult {
  ok: boolean;
  reason?: InquiryFailure;
}

/** Trimmed, because an env var that is accidentally " " is not an endpoint. */
export const ENDPOINT: string = (import.meta.env.PUBLIC_RESERVE_ENDPOINT ?? '').trim();

export const isConfigured = (): boolean => ENDPOINT.length > 0;

/** Milliseconds before a send is treated as failed rather than pending forever. */
const TIMEOUT_MS = 12000;

export async function submitInquiry(payload: Record<string, unknown>): Promise<InquiryResult> {
  if (!isConfigured()) return { ok: false, reason: 'unconfigured' };

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, submittedAt: new Date().toISOString() }),
      signal: controller.signal,
    });
    // Success is the server saying so. Nothing else counts.
    return response.ok ? { ok: true } : { ok: false, reason: 'rejected' };
  } catch {
    return { ok: false, reason: 'network' };
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * What to tell the visitor. Every one of these ends by telling them their
 * details are still in the form, because they are.
 */
export function failureMessage(reason: InquiryFailure | undefined): string {
  switch (reason) {
    case 'unconfigured':
      return 'This form cannot be delivered yet — the inquiry endpoint is not connected. '
        + 'Your details are still here, so nothing has been lost. Please email us instead.';
    case 'rejected':
      return 'The server did not accept that. Your details are still here — please try again, '
        + 'or email us if it keeps failing.';
    default:
      return 'That did not reach us — the request failed on the way. Your details are still here, '
        + 'so you can try again.';
  }
}
