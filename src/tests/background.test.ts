import { afterEach, describe, expect, it, vi } from 'vitest';

type RuntimeMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | void;

describe('background service worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function loadBackgroundWithMocks(overrides?: {
    existingTabs?: Array<{ id?: number; windowId?: number }>;
    queryError?: Error;
  }) {
    let listener: RuntimeMessageListener | undefined;
    const chromeMock = {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://ext-id/${path}`),
        onMessage: {
          addListener: vi.fn((fn: RuntimeMessageListener) => {
            listener = fn;
          }),
        },
      },
      tabs: {
        query: overrides?.queryError
          ? vi.fn().mockRejectedValue(overrides.queryError)
          : vi.fn().mockResolvedValue(overrides?.existingTabs ?? []),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
      },
      windows: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    vi.stubGlobal('chrome', chromeMock);
    vi.resetModules();
    await import('../background/index');
    return { chromeMock, listener: listener! };
  }

  it('ignores unknown messages and opens a new planner tab when none exists', async () => {
    const { chromeMock, listener } = await loadBackgroundWithMocks({ existingTabs: [] });

    expect(listener({ type: 'OTHER' }, {}, vi.fn())).toBe(false);

    const sendResponse = vi.fn();
    const keepChannelOpen = listener({ type: 'OPEN_PLANNER' }, {}, sendResponse);
    expect(keepChannelOpen).toBe(true);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://ext-id/planner.html',
    });
  });

  it('focuses existing planner tab and window when already open', async () => {
    const { chromeMock, listener } = await loadBackgroundWithMocks({
      existingTabs: [{ id: 42, windowId: 7 }],
    });

    const sendResponse = vi.fn();
    listener({ type: 'OPEN_PLANNER' }, {}, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(42, { active: true });
    expect(chromeMock.windows.update).toHaveBeenCalledWith(7, { focused: true });
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  });

  it('returns error response when chrome.tabs API fails', async () => {
    const { listener } = await loadBackgroundWithMocks({
      queryError: new Error('tabs unavailable'),
    });

    const sendResponse = vi.fn();
    listener({ type: 'OPEN_PLANNER' }, {}, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        error: 'Error: tabs unavailable',
      });
    });
  });
});
