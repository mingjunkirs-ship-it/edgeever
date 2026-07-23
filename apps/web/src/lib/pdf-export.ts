const MAX_PRINTABLE_HTML_CHARS = 5 * 1024 * 1024;
const MAX_PDF_IMAGES = 100;
const PDF_FRAME_LOAD_TIMEOUT_MS = 10_000;
const PDF_IMAGE_LOAD_TIMEOUT_MS = 10_000;
const PDF_IMAGE_TOTAL_TIMEOUT_MS = 15_000;
const PDF_FRAME_CLEANUP_TIMEOUT_MS = 30_000;
const PDF_IMAGE_BATCH_SIZE = 8;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character] ?? character));

const ALLOWED_ELEMENTS = new Set([
  "a", "article", "b", "blockquote", "br", "code", "del", "div", "em", "figcaption", "figure",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "mark", "ol", "p", "pre",
  "s", "small", "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead",
  "tr", "u", "ul",
]);

const GLOBAL_ATTRIBUTES = new Set(["aria-label", "class", "dir", "lang", "title"]);
const ELEMENT_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "rel"]),
  img: new Set(["alt", "height", "loading", "referrerpolicy", "src", "width"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
};

const isSafeImageUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#")) return false;
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(trimmed)) return true;

  try {
    const parsed = new URL(trimmed, document.baseURI);
    return (parsed.protocol === "http:" || parsed.protocol === "https:")
      && parsed.origin === window.location.origin;
  } catch {
    return false;
  }
};

const isSafeLinkUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#")) return true;
  try {
    const parsed = new URL(trimmed, document.baseURI);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const sanitizePrintableHtml = (value: string) => {
  // Bound the DOM work even if a very large memo was already stored before
  // public-share content limits were introduced.
  const boundedValue = value.length > MAX_PRINTABLE_HTML_CHARS
    ? `${value.slice(0, MAX_PRINTABLE_HTML_CHARS)}<p>[内容过长，后续内容未导出]</p>`
    : value;
  const documentValue = new DOMParser().parseFromString(`<article>${boundedValue}</article>`, "text/html");
  const root = documentValue.body.firstElementChild;

  if (!root) return "";

  root.querySelectorAll("script,iframe,object,embed,link,meta,base,form,input,button,textarea,select,option,style,template,svg,math").forEach((element) => element.remove());
  root.querySelectorAll("*").forEach((element) => {
    const tagName = element.tagName.toLowerCase();
    if (!ALLOWED_ELEMENTS.has(tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    const allowedAttributes = new Set([
      ...GLOBAL_ATTRIBUTES,
      ...(ELEMENT_ATTRIBUTES[tagName] ?? []),
    ]);
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const shouldKeep = allowedAttributes.has(name);
      if (!shouldKeep) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (name === "src" || name === "poster" || name === "data" || name === "xlink:href") {
        if (!isSafeImageUrl(attribute.value)) element.removeAttribute(attribute.name);
      } else if (name === "href") {
        if (!isSafeLinkUrl(attribute.value)) element.removeAttribute(attribute.name);
      }
    }

    // Never carry arbitrary CSS or responsive URL lists into the print DOM.
    element.removeAttribute("style");
    element.removeAttribute("srcset");
    element.removeAttribute("sizes");
    element.removeAttribute("onload");
    element.removeAttribute("onerror");

    if (tagName === "a" && element.hasAttribute("href")) {
      element.setAttribute("rel", "noreferrer noopener");
    }
    if (tagName === "img") {
      const source = element.getAttribute("src");
      if (!source) {
        element.remove();
        return;
      }
      element.setAttribute("data-pdf-src", source);
      element.removeAttribute("src");
      element.setAttribute("loading", "eager");
      element.setAttribute("decoding", "async");
      element.setAttribute("referrerpolicy", "no-referrer");
    }
  });

  const images = Array.from(root.querySelectorAll("img"));
  images.slice(MAX_PDF_IMAGES).forEach((image) => image.remove());
  return root.innerHTML;
};

const waitForFrameLoad = (frame: HTMLIFrameElement) => new Promise<boolean>((resolve) => {
  let settled = false;
  const timeout = window.setTimeout(() => finish(false), PDF_FRAME_LOAD_TIMEOUT_MS);
  const finish = (loaded: boolean) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    resolve(loaded);
  };
  frame.addEventListener("load", () => finish(true), { once: true });
});

const waitForImageLoad = (image: HTMLImageElement) => new Promise<void>((resolve) => {
  if (image.complete) {
    resolve();
    return;
  }

  let settled = false;
  const timeout = window.setTimeout(() => finish(), PDF_IMAGE_LOAD_TIMEOUT_MS);
  const finish = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    if (!image.complete) image.removeAttribute("src");
    resolve();
  };
  image.addEventListener("load", finish, { once: true });
  image.addEventListener("error", finish, { once: true });
});

const activatePrintableImage = (image: HTMLImageElement) => {
  const source = image.getAttribute("data-pdf-src");
  if (!source) return;
  image.removeAttribute("data-pdf-src");
  image.setAttribute("src", source);
};

const discardPrintableImages = (images: HTMLImageElement[]) => {
  images.forEach((image) => {
    image.removeAttribute("data-pdf-src");
    if (!image.complete) image.removeAttribute("src");
  });
};

const waitForImageBatch = (images: HTMLImageElement[], timeoutMs: number) => new Promise<boolean>((resolve) => {
  let settled = false;
  const finish = (loaded: boolean) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    resolve(loaded);
  };
  const timeout = window.setTimeout(() => finish(false), timeoutMs);
  void Promise.all(images.map(waitForImageLoad)).then(() => finish(true));
});

const waitForPrintableImages = async (images: HTMLImageElement[]) => {
  const deadline = Date.now() + PDF_IMAGE_TOTAL_TIMEOUT_MS;
  for (let index = 0; index < images.length; index += PDF_IMAGE_BATCH_SIZE) {
    const batch = images.slice(index, index + PDF_IMAGE_BATCH_SIZE);
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      discardPrintableImages(images.slice(index));
      break;
    }

    batch.forEach(activatePrintableImage);
    const loaded = await waitForImageBatch(batch, remaining);
    if (!loaded) {
      discardPrintableImages(images.slice(index));
      break;
    }
  }
};

let activePrintFrame: HTMLIFrameElement | null = null;

export const exportMemoToPdf = async ({
  title,
  tags,
  updatedAt,
  bodyHtml,
}: {
  title: string;
  tags: string[];
  updatedAt: string;
  bodyHtml: string;
}) => {
  activePrintFrame?.remove();

  const frame = document.createElement("iframe");
  activePrintFrame = frame;
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("sandbox", "allow-modals allow-same-origin");
  frame.style.position = "fixed";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";

  const printableBody = sanitizePrintableHtml(bodyHtml);
  const frameLoaded = waitForFrameLoad(frame);
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'"><title>${escapeHtml(title)}</title><style>
    @page{size:A4;margin:17mm}
    *{box-sizing:border-box}html{print-color-adjust:exact;-webkit-print-color-adjust:exact}body{margin:0;color:#253244;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:10.8pt;line-height:1.78}.title{max-width:170mm;margin:0;color:#0f172a;font-size:27pt;font-weight:800;letter-spacing:-.025em;line-height:1.18}.meta{display:flex;flex-wrap:wrap;gap:2mm;margin:6mm 0 11mm;padding-bottom:6mm;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:8.7pt}.meta span{display:inline-block;border:1px solid #e2e8f0;border-radius:999px;background:#f8fafc;padding:1.4mm 3mm}.content h1,.content h2,.content h3{break-after:avoid-page;color:#0f172a;line-height:1.3;letter-spacing:-.015em}.content h1{margin:10mm 0 4mm;font-size:21pt}.content h2{margin:9mm 0 3.5mm;font-size:16.5pt}.content h3{margin:7mm 0 3mm;font-size:13pt}.content p{margin:0 0 3.3mm;orphans:3;widows:3}.content ul,.content ol{margin:0 0 4mm;padding-left:7mm}.content li{margin:1.2mm 0;orphans:2;widows:2}.content li::marker{color:#059669}.content img{display:block;max-width:100%;max-height:225mm;height:auto;margin:7mm auto;border:1px solid #e2e8f0;border-radius:3mm;break-inside:avoid-page}.content pre{margin:5mm 0;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #dbe4de;border-radius:3mm;background:#f7faf8;padding:4.5mm;break-inside:avoid-page;font-size:8.7pt;line-height:1.65}.content code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.content :not(pre)>code{border:1px solid #d1fae5;border-radius:1mm;background:#f0fdf4;padding:.2mm 1mm;color:#166534}.content blockquote{margin:5mm 0;border:1px solid #d1fae5;border-left:1.2mm solid #10b981;border-radius:0 3mm 3mm 0;background:#f0fdf4;padding:3.5mm 5mm;color:#334155;break-inside:avoid-page}.content table{width:100%;margin:5mm 0;border-collapse:collapse;break-inside:avoid-page;font-size:9pt}.content th,.content td{border:1px solid #cbd5e1;padding:2.5mm;text-align:left}.content th{background:#f1f5f9;color:#334155}.content a{color:#047857;overflow-wrap:anywhere;text-decoration-color:#6ee7b7;text-underline-offset:1mm}.content hr{margin:8mm 0;border:0;border-top:1px solid #e2e8f0}
  </style></head><body><h1 class="title">${escapeHtml(title)}</h1><div class="meta"><span>${escapeHtml(new Date(updatedAt).toLocaleString())}</span>${tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}</div><article class="content">${printableBody}</article></body></html>`;

  let printStarted = false;
  try {
    document.body.appendChild(frame);
    const loaded = await frameLoaded;
    if (!loaded || !frame.contentDocument) return;

    const images = Array.from(frame.contentDocument.images).slice(0, MAX_PDF_IMAGES);
    await waitForPrintableImages(images);

    const printWindow = frame.contentWindow;
    if (!printWindow) return;
    printWindow.focus();
    printWindow.addEventListener("afterprint", () => {
      if (activePrintFrame === frame) activePrintFrame = null;
      frame.remove();
    }, { once: true });
    printWindow.print();
    printStarted = true;
    window.setTimeout(() => {
      if (activePrintFrame === frame) activePrintFrame = null;
      frame.remove();
    }, PDF_FRAME_CLEANUP_TIMEOUT_MS);
  } finally {
    if (!printStarted) {
      if (activePrintFrame === frame) activePrintFrame = null;
      frame.remove();
    }
  }
};
