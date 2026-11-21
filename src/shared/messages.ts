export type ExtensionMessage = { type: 'OPEN_PLANNER' };

export interface ExtensionResponse {
  ok: boolean;
  error?: string;
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'OPEN_PLANNER'
  );
}

export async function sendExtensionMessage(
  message: ExtensionMessage,
): Promise<ExtensionResponse> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return { ok: false, error: 'Chrome runtime API no disponible.' };
  }

  try {
    const response = (await chrome.runtime.sendMessage(message)) as ExtensionResponse | undefined;
    return response ?? { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function requestOpenPlanner(): Promise<ExtensionResponse> {
  return sendExtensionMessage({ type: 'OPEN_PLANNER' });
}
