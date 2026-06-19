import { useRef } from "react";
import { toPng } from "html-to-image";
import { QRCodeCanvas } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { buildQrPayload, type QrWindowData } from "~/lib/qr";

export function WindowQrDialog({
  open,
  onOpenChange,
  window: windowData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  window: QrWindowData;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  async function handleDownload() {
    if (!containerRef.current) return;
    const dataUrl = await toPng(containerRef.current);
    const link = document.createElement("a");
    link.download = `ventana-${windowData.id}.png`;
    link.href = dataUrl;
    link.click();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Código QR de la ventana</DialogTitle>
        </DialogHeader>
        <div ref={containerRef} className="flex flex-col items-center gap-3 bg-white p-4">
          <QRCodeCanvas value={buildQrPayload(windowData)} size={220} />
          <p className="text-sm text-center whitespace-pre-line">
            {buildQrPayload(windowData)}
          </p>
        </div>
        <Button onClick={handleDownload}>Descargar PNG</Button>
      </DialogContent>
    </Dialog>
  );
}
