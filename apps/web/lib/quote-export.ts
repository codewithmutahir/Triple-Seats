/** Snapshot passed to export endpoints — server reads authoritative state from DB. */
export type QuoteExportPayload = Record<string, never>;

export function buildExportPayloadFromBuilder(): QuoteExportPayload {
  return {};
}

/** Save a PDF fetch Response via blob URL. Returns false if body was empty/invalid. */
export async function downloadPdfFromResponse(
  res: Response,
  filename: string
): Promise<{ ok: true } | { ok: false; reason: "empty" | "invalid" }> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) {
    return { ok: false, reason: "empty" };
  }
  const header = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (header !== "%PDF") {
    return { ok: false, reason: "invalid" };
  }
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { ok: true };
}

