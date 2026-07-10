import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import klhLogoUrl from "../assets/klh-logo.png";

// Helper to load image and convert to base64
function getBase64ImageFromUrl(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      const dataURL = canvas.toDataURL("image/png");
      resolve(dataURL);
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

export async function generatePDF(title: string, columns: string[], rows: any[][], filename: string) {
  const doc = new jsPDF();
  
  try {
    const logoBase64 = await getBase64ImageFromUrl(klhLogoUrl);
    // Draw logo left-aligned
    // Assuming aspect ratio of approx 3:1 for the logo
    doc.addImage(logoBase64, "PNG", 14, 10, 45, 15);
  } catch (err) {
    console.warn("Failed to load logo for PDF", err);
  }

  // Add Title
  doc.setFontSize(18);
  doc.setTextColor(17, 24, 39); // gray-900
  doc.text(title, 14, 35);

  // Add Date
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128); // gray-500
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 42);

  // Add Table
  autoTable(doc, {
    startY: 48,
    head: [columns],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [153, 27, 27] }, // brand-700
    styles: { fontSize: 9 },
  });

  doc.save(`${filename}.pdf`);
}
