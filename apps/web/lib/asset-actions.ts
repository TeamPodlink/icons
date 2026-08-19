import { toast } from "sonner";

/** Copy plain text with the house success toast. Resolves true when the
 *  write actually landed, for callers that show a copied state. */
export async function copyText(text: string, description: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard", { description });
    return true;
  } catch {
    toast.error("Clipboard copy not available");
    return false;
  }
}

/** Copy a PNG asset to the clipboard as an image (blob-fetch, so it
 *  works for cross-origin R2 assets too). */
export async function copyImage(url: string, description: string) {
  try {
    const blob = await fetch(url).then((r) => r.blob());
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast.success("Copied to clipboard", { description });
  } catch {
    toast.error("Clipboard image copy not supported in this browser");
  }
}

/** Fetch an SVG asset and copy its markup as text. */
export async function copySvg(url: string, description: string) {
  const svg = await fetch(url).then((r) => r.text());
  await copyText(svg, description);
}

/**
 * Download via fetch + blob object URL: the `download` attribute is
 * ignored on cross-origin hrefs (production serves assets from R2),
 * where a plain anchor would navigate instead of saving. Same-origin
 * (dev /library, /flat, /badges) goes through the identical path.
 */
export async function downloadAsset(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    const objectUrl = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    toast.error("Download failed");
  }
}
