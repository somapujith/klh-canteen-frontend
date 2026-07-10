import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { AdminNav } from "../../components/AdminNav";
import { generatePDF } from "../../utils/pdfExport";

export function AdminDashboardPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState({ totalOrdersToday: 0, totalRevenueToday: "0.00" });
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    apiClient.get<typeof stats>("/admin/orders/stats", token ?? undefined).then(setStats).catch(console.error);
  }, [token]);

  async function exportInventory() {
    setIsExporting(true);
    try {
      const { categories } = await apiClient.get<{ categories: any[] }>("/menu");
      const rows: any[][] = [];
      categories.forEach((cat) => {
        cat.items.forEach((item: any) => {
          rows.push([
            cat.name,
            item.name,
            `Rs. ${item.price}`,
            item.stockQty.toString(),
            item.isAvailable ? "Yes" : "No"
          ]);
        });
      });
      await generatePDF("Inventory Status Report", ["Category", "Item Name", "Price", "Stock Quantity", "Visible"], rows, "KLH_Inventory_Report");
    } catch (err) {
      console.error(err);
      alert("Failed to export inventory");
    }
    setIsExporting(false);
  }

  async function exportSales() {
    setIsExporting(true);
    try {
      const orders = await apiClient.get<any[]>("/admin/orders", token ?? undefined);
      
      const salesMap = new Map<string, { qty: number, revenue: number, name: string }>();
      
      orders.forEach(order => {
        if (order.status === "DELIVERED") {
          order.items.forEach((item: any) => {
            const current = salesMap.get(item.menuItem.id) || { qty: 0, revenue: 0, name: item.menuItem.name };
            current.qty += item.qty;
            current.revenue += item.qty * Number(item.priceAtTime);
            salesMap.set(item.menuItem.id, current);
          });
        }
      });

      const rows = Array.from(salesMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .map(s => [
          s.name,
          s.qty.toString(),
          `Rs. ${s.revenue.toFixed(2)}`
        ]);

      await generatePDF("Sales Summary (Delivered Orders)", ["Item Name", "Total Quantity Sold", "Total Revenue"], rows, "KLH_Sales_Report");
    } catch (err) {
      console.error(err);
      alert("Failed to export sales");
    }
    setIsExporting(false);
  }

  async function exportLogs() {
    setIsExporting(true);
    try {
      const orders = await apiClient.get<any[]>("/admin/orders", token ?? undefined);
      
      const rows = orders.map(order => [
        order.id.slice(0, 8).toUpperCase(),
        new Date(order.createdAt).toLocaleString(),
        order.student?.name || order.student?.email || "Unknown",
        `${order.items.length} items`,
        `Rs. ${order.totalAmount}`,
        order.status
      ]);

      await generatePDF("Transaction Logs", ["Order ID", "Date", "Student", "Items", "Total", "Status"], rows, "KLH_Transaction_Logs");
    } catch (err) {
      console.error(err);
      alert("Failed to export logs");
    }
    setIsExporting(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <AdminNav />

      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6 mt-4">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 rounded-3xl p-8 sm:p-12 text-white shadow-xl flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
          <h1 className="text-3xl sm:text-5xl font-extrabold mb-4 relative z-10">Ready to Scan?</h1>
          <p className="text-brand-100 mb-8 max-w-md relative z-10 text-lg">
            Scan student QR codes to deliver orders quickly and securely.
          </p>
          <Link
            to="/admin/scan"
            className="relative z-10 bg-white text-brand-700 hover:bg-gray-50 font-bold text-xl px-12 py-4 rounded-full shadow-lg transition-transform transform hover:scale-105 active:scale-95 flex items-center gap-3"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            OPEN SCANNER
          </Link>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-center">
            <div className="text-sm text-gray-500 font-medium mb-1">Today's Orders</div>
            <div className="text-4xl font-black text-gray-900">{stats.totalOrdersToday}</div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-center">
            <div className="text-sm text-gray-500 font-medium mb-1">Today's Revenue</div>
            <div className="text-4xl font-black text-brand-600">₹{stats.totalRevenueToday}</div>
          </div>
        </div>

        {/* Quick Links Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link to="/admin/inventory" className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition flex flex-col items-center text-center gap-3 group">
            <div className="bg-orange-100 text-orange-600 p-4 rounded-full group-hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">Inventory</h3>
              <p className="text-sm text-gray-500 mt-1">Manage menu, prices & stock</p>
            </div>
          </Link>

          <Link to="/admin/logs" className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition flex flex-col items-center text-center gap-3 group">
            <div className="bg-blue-100 text-blue-600 p-4 rounded-full group-hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">Order Logs</h3>
              <p className="text-sm text-gray-500 mt-1">View all past orders</p>
            </div>
          </Link>

          <Link to="/admin/students" className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition flex flex-col items-center text-center gap-3 group">
            <div className="bg-purple-100 text-purple-600 p-4 rounded-full group-hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">Students</h3>
              <p className="text-sm text-gray-500 mt-1">Manage accounts & imports</p>
            </div>
          </Link>

          <Link to="/admin/payments" className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition flex flex-col items-center text-center gap-3 group">
            <div className="bg-green-100 text-green-600 p-4 rounded-full group-hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <span className="font-medium text-gray-900 group-hover:text-brand-600 transition">Payments</span>
          </Link>
        </div>

        {/* Export Reports Section */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Export Reports</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button 
              onClick={exportSales} 
              disabled={isExporting}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between hover:border-brand-500 hover:shadow-md transition text-left group disabled:opacity-50"
            >
              <div>
                <div className="font-semibold text-gray-900 group-hover:text-brand-600 transition">Export Sales</div>
                <div className="text-xs text-gray-500 mt-1">Item-wise revenue summary</div>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 group-hover:text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            </button>
            <button 
              onClick={exportInventory} 
              disabled={isExporting}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between hover:border-brand-500 hover:shadow-md transition text-left group disabled:opacity-50"
            >
              <div>
                <div className="font-semibold text-gray-900 group-hover:text-brand-600 transition">Export Inventory</div>
                <div className="text-xs text-gray-500 mt-1">Current stock and prices</div>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 group-hover:text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            </button>
            <button 
              onClick={exportLogs} 
              disabled={isExporting}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between hover:border-brand-500 hover:shadow-md transition text-left group disabled:opacity-50"
            >
              <div>
                <div className="font-semibold text-gray-900 group-hover:text-brand-600 transition">Export Transaction Logs</div>
                <div className="text-xs text-gray-500 mt-1">Full order history details</div>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 group-hover:text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
