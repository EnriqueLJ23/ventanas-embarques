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
import { buildCheckinUrl, buildQrPayload, type QrWindowData } from "~/lib/qr";

export function WindowQrDialog({
  open,
  onOpenChange,
  window: windowData,
  checkinToken,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  window: QrWindowData;
  checkinToken?: string;
}) {
  const qrRef = useRef<HTMLDivElement>(null);

  async function handleDownload() {
    if (!qrRef.current) return;
    const dataUrl = await toPng(qrRef.current);
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
        <div className="flex flex-col items-center gap-3 bg-white p-4">
          <div ref={qrRef} className="bg-white p-2">
            <QRCodeCanvas
              value={buildCheckinUrl(typeof window === "undefined" ? "" : window.location.origin, windowData.id, checkinToken)}
              size={220}
            />
          </div>
          <p className="text-sm text-center whitespace-pre-line text-black">
            {buildQrPayload(windowData)}
          </p>
        </div>
        <Button onClick={handleDownload}>Descargar PNG</Button>
      </DialogContent>
    </Dialog>
  );
}
