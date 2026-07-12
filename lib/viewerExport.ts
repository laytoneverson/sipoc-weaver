import { toPng, toSvg } from "html-to-image";
import { jsPDF } from "jspdf";

export type ViewerExportFormat = "png" | "svg" | "pdf";

function safeFilename(name: string): string {
  return name.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 80) || "export";
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

async function captureOptions(node: HTMLElement) {
  const rect = node.getBoundingClientRect();
  return {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor:
      getComputedStyle(document.documentElement).getPropertyValue(
        "--background",
      ).trim() || "#ffffff",
    width: Math.max(node.scrollWidth, rect.width),
    height: Math.max(node.scrollHeight, rect.height),
    style: {
      transform: "none",
      overflow: "visible",
    },
  };
}

export async function exportViewerElement(
  node: HTMLElement,
  format: ViewerExportFormat,
  basename: string,
): Promise<void> {
  const options = await captureOptions(node);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${safeFilename(basename)}_${stamp}`;

  if (format === "png") {
    const dataUrl = await toPng(node, options);
    triggerDownload(dataUrl, `${base}.png`);
    return;
  }

  if (format === "svg") {
    const dataUrl = await toSvg(node, options);
    triggerDownload(dataUrl, `${base}.svg`);
    return;
  }

  // PDF: embed a high-res PNG into a landscape page sized to content
  const dataUrl = await toPng(node, options);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load export image"));
    img.src = dataUrl;
  });

  const pxToMm = 0.264583;
  const margin = 10;
  const imgW = img.width * pxToMm;
  const imgH = img.height * pxToMm;
  const pageW = imgW + margin * 2;
  const pageH = imgH + margin * 2;
  const orientation = pageW >= pageH ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: [pageW, pageH],
  });
  pdf.addImage(dataUrl, "PNG", margin, margin, imgW, imgH);
  pdf.save(`${base}.pdf`);
}
