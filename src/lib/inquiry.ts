/** Shared delivery for both public inquiry forms. Keep fields on every failure. */
import { CONTACT_EMAIL, FORM_ENDPOINT } from '../data/contact';

export type InquiryFailure = 'rejected' | 'network';
export interface InquiryResult { ok: boolean; reason?: InquiryFailure }
export const ENDPOINT = (import.meta.env.PUBLIC_RESERVE_ENDPOINT ?? '').trim() || FORM_ENDPOINT;
const TIMEOUT_MS = 12000;

export async function submitInquiry(payload: Record<string, unknown>): Promise<InquiryResult> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...payload, _subject: 'SmartTec deployment inquiry', _template: 'table', submittedAt: new Date().toISOString() }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: 'rejected' };
    // HTTP 200 alone can also mean a failed or unactivated submission.
    // Custom relays must use this same explicit acknowledgment contract.
    const body = await response.json();
    return body.success === true || body.success === 'true'
      ? { ok: true } : { ok: false, reason: 'rejected' };
  } catch {
    return { ok: false, reason: 'network' };
  } finally {
    window.clearTimeout(timer);
  }
}

export function failureMessage(_reason: InquiryFailure | undefined): string {
  return `Delivery could not be confirmed. Your details are still here. Please try again or email ${CONTACT_EMAIL}.`;
}
