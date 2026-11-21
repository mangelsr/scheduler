import { afterEach, describe, expect, it, vi } from 'vitest';
import { isExtensionMessage, requestOpenPlanner, sendExtensionMessage } from '../shared/messages';

describe('extension messages', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates ExtensionMessage shapes strictly', () => {
    expect(isExtensionMessage({ type: 'OPEN_PLANNER' })).toBe(true);
    expect(isExtensionMessage({ type: 'UNKNOWN' })).toBe(false);
    expect(isExtensionMessage(null)).toBe(false);
    expect(isExtensionMessage('OPEN_PLANNER')).toBe(false);
  });

  it('returns graceful error when chrome.runtime is unavailable', async () => {
    const res = await requestOpenPlanner();
    expect(res.ok).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('forwards runtime responses and catches sendMessage rejections', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    const okRes = await sendExtensionMessage({ type: 'OPEN_PLANNER' });
    expect(okRes).toEqual({ ok: true });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'OPEN_PLANNER' });

    sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist'));
    const errRes = await requestOpenPlanner();
    expect(errRes.ok).toBe(false);
    expect(errRes.error).toContain('Receiving end does not exist');
  });
});
