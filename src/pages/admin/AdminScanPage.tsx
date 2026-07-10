import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { AdminNav } from "../../components/AdminNav";

interface ScannedOrder {
  id: string;
  status: string;
  items: { quantity: number; menuItem: { name: string } }[];
  student: { name: string };
}

const SCAN_REGION_ID = "klh-qr-scan-region";

export function AdminScanPage() {
  const { token } = useAuth();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [order, setOrder] = useState<ScannedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [delivering, setDelivering] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function startScanner() {
    setError(null);
    setOrder(null);
    const scanner = new Html5Qrcode(SCAN_REGION_ID);
    scannerRef.current = scanner;
    setScanning(true);
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        async (decodedText) => {
          await scanner.stop();
          setScanning(false);
          handleScanSuccess(decodedText);
        },
        () => {
          // per-frame decode failures are expected while aiming — ignore
        }
      );
    } catch {
      setError("Camera unavailable. Check browser permissions.");
      setScanning(false);
    }
  }

  async function handleScanSuccess(decodedToken: string) {
    try {
      const result = await apiClient.get<ScannedOrder>(`/admin/orders/scan/${decodedToken}`, token ?? undefined);
      setOrder(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid QR code");
    }
  }

  async function handleDeliver() {
    if (!order) return;
    setDelivering(true);
    try {
      await apiClient.post(`/admin/orders/${order.id}/deliver`, {}, token ?? undefined);
      setOrder(null);
      startScanner();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark delivered");
    } finally {
      setDelivering(false);
    }
  }

  useEffect(() => {
    startScanner();
    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <AdminNav />
      <div className="max-w-md mx-auto p-4 space-y-4">
        {!order && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div id={SCAN_REGION_ID} data-testid="scan-region" className="rounded-xl overflow-hidden" />
            {scanning && <p className="text-center text-sm text-gray-500 mt-2">Point camera at student's QR</p>}
          </div>
        )}

        {error && (
          <div className="bg-red-50 rounded-2xl p-4 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={startScanner} className="underline">
              Retry
            </button>
          </div>
        )}

        {order && (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
            <h2 className="font-semibold text-brand-900">{order.student.name}'s Order</h2>
            <ul className="space-y-1 text-sm">
              {order.items.map((line, idx) => (
                <li key={idx}>
                  {line.menuItem.name} × {line.quantity}
                </li>
              ))}
            </ul>
            <button
              onClick={handleDeliver}
              disabled={delivering}
              className="w-full rounded-xl bg-brand-600 text-white py-2.5 font-medium hover:bg-brand-700 disabled:opacity-50 transition"
            >
              {delivering ? "Confirming..." : "Mark as Delivered"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
