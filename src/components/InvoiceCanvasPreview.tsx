import React from "react";
import {
  ClientId,
  EditableDRLine,
  FormType,
  InvoiceData,
  LayoutOffsetsMap,
  SignatoryData,
  TransferInventoryData,
} from "../types";
import {
  amountToWords,
  formatCurrency,
  formatDateLong,
  formatDateMMDDYYYY,
} from "../utils/amountToWords";
import { DraggableField } from "./DraggableField";

export interface PreviewProps {
  client: ClientId;
  formType: FormType;
  invoices: InvoiceData[];
  transfers: TransferInventoryData[];
  vatType: "Inclusive" | "Exclusive";
  note: string;
  businessStyle: string;
  pwdSignature: string;
  acNo: string;
  dateIssued: string;
  includeDateIssued: boolean;
  enableExpDate: boolean;
  lessEwt1: boolean;
  lessEwt2: boolean;
  manualEwtAmount: string;
  isReprint: boolean;
  seriesNumberText: string;
  signatory: SignatoryData;
  // DR override fields (NHC / MET)
  drCustomerName: string;
  drAddress: string;
  drTerms: string;
  drStoreCode: string;
  drPoNumber: string;
  drTin: string;
  allowPriceEditing: boolean;
  editableLines: EditableDRLine[];
  showPreprintedGuide: boolean;
  ivpRotatePrint: boolean;
  zoom: number;
  adjustMode: boolean;
  selectedField: string;
  onSelectField: (fieldKey: string) => void;
  layoutOffsets: LayoutOffsetsMap;
  onUpdateOffset: (
    fieldKey: string,
    dx: number,
    dy: number,
    announcement?: string
  ) => void;
}

interface ProcessedTableLine {
  description: string;
  quantityText: string;
  uomText: string;
  unitPriceText: string;
  amountText: string;
  rawAmount: number;
}

/**
 * Processes invoice line items using the exact 4 cases from Layout_Enclosure / Layout_FP / Layout_PBS:
 * Case 1: Discount line
 * Case 2: Description-only line after Subtotal
 * Case 3: Combined line when Rate == 0 and nextItem.Rate == 0
 * Case 4: Regular line item
 */
function processStandardLineItems(
  invoices: InvoiceData[],
  vatType: "Inclusive" | "Exclusive",
  enableExpDate = false
) {
  const rows: ProcessedTableLine[] = [];
  let totalAmount = 0;
  let vatableSalesTotal = 0;
  let zeroRatedSalesTotal = 0;
  let vatExemptSalesTotal = 0;

  for (const invoice of invoices) {
    const items = invoice.lineItems || [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.description === "Subtotal") continue;

      const isTaxable =
        item.salesTaxTotal !== 0 && item.tax !== "Non" && item.taxesName !== "Out of State";
      const hasNext = i + 1 < items.length;
      const nextItem = hasNext ? items[i + 1] : null;

      let baseDesc = item.description || "";
      if (enableExpDate && item.skuCode) {
        baseDesc = `${item.skuCode} ${baseDesc}`;
      }
      if (enableExpDate && item.expirationDate) {
        baseDesc = `${baseDesc} (Exp. ${item.expirationDate})`;
      }

      if (vatType === "Inclusive") {
        const rateAdjustment = isTaxable ? item.rate * 0.12 : 0;
        const unitRateToDraw =
          item.taxesName !== "Out of State" ? item.rate + rateAdjustment : item.rate;

        if (item.taxesName === "Zero Rated Sales" || invoice.taxesName === "Zero rated sales") {
          zeroRatedSalesTotal += item.amount;
        } else if (item.taxesName === "Vat Exempt" || invoice.taxesName === "Vat Exempt") {
          vatExemptSalesTotal += item.amount;
        } else if (isTaxable) {
          vatableSalesTotal += item.amount;
        }

        // Case 1: Discount line
        if (
          baseDesc.toLowerCase().includes("discount") ||
          String(item.rate).includes("%") ||
          item.amount < 0
        ) {
          const discountAmount = isTaxable ? item.amount * 1.12 : item.amount;
          rows.push({
            description: baseDesc,
            quantityText: formatCurrency(item.quantity),
            uomText: item.unitOfMeasure || "",
            unitPriceText: formatCurrency(item.rate),
            amountText: formatCurrency(discountAmount),
            rawAmount: discountAmount,
          });
          totalAmount += discountAmount;
          continue;
        }

        // Case 2: Description-only line after Subtotal
        if (item.rate === 0 && i > 0 && items[i - 1].description === "Subtotal") {
          rows.push({
            description: baseDesc,
            quantityText: "",
            uomText: "",
            unitPriceText: "",
            amountText: formatCurrency(item.amount),
            rawAmount: item.amount,
          });
          totalAmount += item.amount;
          continue;
        }

        // Case 3: Discount follows item with Rate == 0
        if (
          item.rate === 0 &&
          hasNext &&
          nextItem &&
          nextItem.rate === 0 &&
          nextItem.description !== "Subtotal"
        ) {
          let combinedAmount = item.amount + nextItem.amount;
          if (isTaxable) combinedAmount *= 1.12;
          const desc = `${baseDesc} (${nextItem.description})`;
          rows.push({
            description: desc,
            quantityText: formatCurrency(item.quantity),
            uomText: item.unitOfMeasure || "",
            unitPriceText: formatCurrency(item.rate),
            amountText: formatCurrency(combinedAmount),
            rawAmount: combinedAmount,
          });
          totalAmount += combinedAmount;
          i++;
          continue;
        }

        // Case 4: Regular line item
        const adjustedAmount = isTaxable ? item.amount * 1.12 : item.amount;
        rows.push({
          description: baseDesc,
          quantityText: formatCurrency(item.quantity),
          uomText: item.unitOfMeasure || "",
          unitPriceText: formatCurrency(unitRateToDraw),
          amountText: formatCurrency(adjustedAmount),
          rawAmount: adjustedAmount,
        });
        totalAmount += adjustedAmount;
      } else {
        // Exclusive
        const unitRateToDraw = item.rate;

        if (item.taxesName === "Zero Rated Sales" || invoice.taxesName === "Zero rated sales") {
          zeroRatedSalesTotal += item.amount;
        } else if (item.taxesName === "Vat Exempt" || invoice.taxesName === "Vat Exempt") {
          vatExemptSalesTotal += item.amount;
        } else if (item.tax !== "Non") {
          vatableSalesTotal += item.amount;
        }

        // Case 1: Discount
        if (
          baseDesc.toLowerCase().includes("discount") ||
          String(item.rate).includes("%") ||
          item.amount < 0
        ) {
          rows.push({
            description: baseDesc,
            quantityText: formatCurrency(item.quantity),
            uomText: item.unitOfMeasure || "",
            unitPriceText: formatCurrency(item.rate),
            amountText: formatCurrency(item.amount),
            rawAmount: item.amount,
          });
          totalAmount += item.amount;
          continue;
        }

        // Case 2: Description-only line after Subtotal
        if (item.rate === 0 && i > 0 && items[i - 1].description === "Subtotal") {
          rows.push({
            description: baseDesc,
            quantityText: "",
            uomText: "",
            unitPriceText: "",
            amountText: formatCurrency(item.amount),
            rawAmount: item.amount,
          });
          totalAmount += item.amount;
          continue;
        }

        // Case 3: Combined line
        if (
          item.rate === 0 &&
          hasNext &&
          nextItem &&
          nextItem.rate === 0 &&
          nextItem.description !== "Subtotal"
        ) {
          const combinedAmount = item.amount + nextItem.amount;
          const desc = `${baseDesc} (${nextItem.description})`;
          rows.push({
            description: desc,
            quantityText: formatCurrency(item.quantity),
            uomText: item.unitOfMeasure || "",
            unitPriceText: formatCurrency(item.rate),
            amountText: formatCurrency(combinedAmount),
            rawAmount: combinedAmount,
          });
          totalAmount += combinedAmount;
          i++;
          continue;
        }

        // Case 4: Regular line
        rows.push({
          description: baseDesc,
          quantityText: formatCurrency(item.quantity),
          uomText: item.unitOfMeasure || "",
          unitPriceText: formatCurrency(unitRateToDraw),
          amountText: formatCurrency(item.amount),
          rawAmount: item.amount,
        });
        totalAmount += item.amount;
      }
    }
  }

  return {
    rows,
    totalAmount,
    vatableSalesTotal,
    zeroRatedSalesTotal,
    vatExemptSalesTotal,
  };
}

export const InvoiceCanvasPreview: React.FC<PreviewProps> = (props) => {
  const {
    client,
    formType,
    invoices,
    transfers,
    vatType,
    note,
    businessStyle,
    acNo,
    dateIssued,
    enableExpDate,
    lessEwt1,
    lessEwt2,
    manualEwtAmount,
    isReprint,
    seriesNumberText,
    signatory,
    drCustomerName,
    drAddress,
    drTerms,
    drStoreCode,
    drPoNumber,
    drTin,
    allowPriceEditing,
    editableLines,
    showPreprintedGuide,
    ivpRotatePrint,
    zoom,
    adjustMode,
    selectedField,
    onSelectField,
    layoutOffsets,
    onUpdateOffset,
  } = props;

  const dragCommon = {
    adjustMode,
    selectedField,
    onSelectField,
    offsets: layoutOffsets,
    onUpdateOffset,
    zoom,
  };

  const inv = invoices[0];

  // =========================================================================
  // 1. ENCLOSURE / FP / PBS STANDARD BORDERED SALES INVOICE (850 x 1100)
  // =========================================================================
  if (client === "Enclosure" || client === "FP" || client === "PBS") {
    if (!inv) return null;

    const { rows, zeroRatedSalesTotal, vatExemptSalesTotal } = processStandardLineItems(
      invoices,
      vatType,
      false
    );

    const firstLine = inv.lineItems[0] || {
      totalAmount: inv.balanceRemaining || inv.totalAmount || 0,
      salesTaxTotal: inv.salesTaxTotal || 0,
      tax: "Tax",
      taxesName: inv.taxesName || "Vatable",
    };

    let amountNetVat = 0;
    for (const invoice of invoices) {
      for (const li of invoice.lineItems) {
        amountNetVat = li.totalAmount - li.salesTaxTotal;
      }
    }
    if (amountNetVat <= 0 && firstLine.totalAmount > 0) {
      amountNetVat = firstLine.totalAmount - firstLine.salesTaxTotal;
    }

    const isVAT = firstLine.tax !== "Non" || firstLine.taxesName === "Vatable";
    const hasVAT = firstLine.salesTaxTotal > 0;

    // EWT Calculation
    let ewtAmount = 0;
    const parsedManual = parseFloat(manualEwtAmount);
    if (client === "Enclosure" && !isNaN(parsedManual) && parsedManual > 0) {
      ewtAmount = parsedManual;
    } else if (lessEwt1) {
      ewtAmount = amountNetVat * 0.01;
    } else if (client === "Enclosure" && lessEwt2) {
      ewtAmount = amountNetVat * 0.02;
    }

    const totalAmountDue = firstLine.totalAmount - ewtAmount;
    const words = amountToWords(totalAmountDue);

    const isFP = client === "FP";
    const isPBS = client === "PBS";
    const isEnclosure = client === "Enclosure";

    const xStart = isEnclosure ? 25 : 50;
    const yStart = 40;
    const maxWidth = 750;
    const yStartDetails = 180;
    const rectHeight = 28;
    const rightWidth = 180;
    const leftWidth = maxWidth - rightWidth;
    const yStartExtraFields = yStartDetails + rectHeight * 3;
    const yStartTable = yStartExtraFields + rectHeight + 5;
    const tableDataHeight = 26;

    const wDesc = 350;
    const wQty = 130;
    const wPrice = 130;
    const wAmt = 140;

    const xDesc = xStart;
    const xQty = xStart + wDesc;
    const xPrice = xStart + wDesc + wQty;
    const xAmt = xStart + wDesc + wQty + wPrice;

    const logoSrc = isEnclosure
      ? "/resources/logo-enclosure.jpg"
      : isFP
      ? "/resources/future-perfect-logo2.png"
      : "/resources/logo-plan-b.jpg";

    const companyName = isEnclosure
      ? "ENCLOSURE SYSTEMS SPECIALISTS, INC."
      : isFP
      ? "FP Philippines, Inc."
      : "PLAN B SOLUTIONS INC.";

    const companyAddress = isEnclosure
      ? "Warehouse 1-B Narra Bldg., 2276 Chino Roces Ave. Ext.,\nMagallanes 1232, City of Makati, NCR, Fourth District, Philippines"
      : isFP
      ? "Unit 1407B, 88 Corporate Center, Sedeño cor. Valero St., \n Makati City, Philippines\n(+632) 8856 9197\nfinance@futureperfect.com"
      : "Rm. 217-A Narra Bldg., 2276 Chino Roces Ave. Extn., Magallanes 1232\nCity of Makati, NCR, Fourth District, Philippines";

    const companyTIN = isEnclosure
      ? "VAT REG. TIN: 004-661-469-00000"
      : isFP
      ? "TIN #: 406 794 995 000"
      : "VAT REG. TIN: 010-044-372-00000";

    const customerDisplay =
      isEnclosure && businessStyle.trim() !== ""
        ? businessStyle
        : inv.customerName || "";

    const addressParts = [
      inv.billAddress1,
      inv.billAddress2,
      inv.billAddress3,
      inv.billAddress4,
      inv.billAddress5,
    ].filter((p) => p && p.trim() !== "");

    const formattedAddress = isEnclosure
      ? addressParts.join(" ")
      : addressParts.slice(0, 2).join("\n");

    const yStartSignatory = yStartTable + tableDataHeight * 20;
    const yStartFooter = yStartSignatory + rectHeight * 4 + 8;

    return (
      <div
        className="print-sheet-wrapper"
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: "top center",
        }}
      >
        <div
          className="print-sheet"
          style={{
            width: 850,
            height: 1100,
            position: "relative",
            backgroundColor: "#ffffff",
            color: "#000000",
            fontFamily: isFP ? "'Poppins', sans-serif" : "'Microsoft Sans Serif', Arial, sans-serif",
            boxSizing: "border-box",
          }}
        >
          {/* Logo */}
          <img
            src={logoSrc}
            alt={`${client} logo`}
            style={{
              position: "absolute",
              left: xStart - 5,
              top: 45,
              width: 150,
              height: 80,
              objectFit: "contain",
            }}
          />

          {/* Company Header */}
          <div
            style={{
              position: "absolute",
              left: xStart,
              top: yStart,
              width: maxWidth,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16pt",
              fontWeight: 700,
              color: isFP ? "#00ade6" : "#000000",
              textAlign: "center",
            }}
          >
            {companyName}
          </div>
          <div
            style={{
              position: "absolute",
              left: xStart,
              top: yStart + 30,
              width: maxWidth,
              height: isFP ? 52 : 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: isFP ? "8.5pt" : "10pt",
              whiteSpace: "pre-line",
              textAlign: "center",
              lineHeight: 1.25,
            }}
          >
            {companyAddress}
          </div>
          <div
            style={{
              position: "absolute",
              left: xStart,
              top: isFP ? yStart + 76 : yStart + 55,
              width: maxWidth,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: isFP ? "8pt" : "10pt",
              textAlign: "center",
            }}
          >
            {companyTIN}
          </div>

          {/* INVOICE & SERIES NO */}
          <div
            style={{
              position: "absolute",
              left: xStart,
              top: yStart + 100,
              fontSize: "13pt",
              fontWeight: 700,
            }}
          >
            INVOICE
          </div>
          <div
            style={{
              position: "absolute",
              left: isFP ? xStart + 560 : xStart + 630,
              top: yStart + 100,
              fontSize: "13pt",
              color: "#dc2626",
              fontWeight: 600,
            }}
          >
            {isFP ? `NO. INV. ${seriesNumberText}` : `NO. ${seriesNumberText}`}
          </div>

          {/* Customer Details Block */}
          <div
            style={{
              position: "absolute",
              left: xStart,
              top: yStartDetails,
              width: leftWidth,
              height: rectHeight,
              display: "flex",
              alignItems: "center",
              fontSize: "10pt",
            }}
          >
            <span>Customer&apos;s Name:</span>
            <span
              style={{
                marginLeft: 10,
                flex: 1,
                borderBottom: isFP || isPBS ? "1px solid #000" : "none",
                paddingBottom: 1,
                fontWeight: 500,
              }}
            >
              {customerDisplay}
            </span>
          </div>

          <div
            style={{
              position: "absolute",
              left: xStart,
              top: yStartDetails + rectHeight,
              width: leftWidth,
              height: rectHeight * 2,
              fontSize: "10pt",
              display: "flex",
              alignItems: "flex-start",
              paddingTop: 4,
            }}
          >
            <span style={{ whiteSpace: "nowrap" }}>Business Address:</span>
            <span
              style={{
                marginLeft: 10,
                flex: 1,
                whiteSpace: "pre-line",
                borderBottom: isFP || isPBS ? "1px solid #000" : "none",
                minHeight: rectHeight,
              }}
            >
              {formattedAddress}
            </span>
          </div>

          {/* Date / TIN / Terms on Right */}
          <div
            style={{
              position: "absolute",
              left: xStart + leftWidth,
              top: yStartDetails,
              width: rightWidth,
              height: rectHeight,
              display: "flex",
              alignItems: "center",
              fontSize: "10pt",
            }}
          >
            <span>Date:</span>
            <span
              style={{
                marginLeft: 8,
                flex: 1,
                borderBottom: isFP || isPBS ? "1px solid #000" : "none",
              }}
            >
              {formatDateMMDDYYYY(inv.txnDate)}
            </span>
          </div>

          <div
            style={{
              position: "absolute",
              left: xStart + leftWidth,
              top: yStartDetails + rectHeight,
              width: rightWidth,
              height: rectHeight,
              display: "flex",
              alignItems: "center",
              fontSize: "10pt",
            }}
          >
            <span>TIN:</span>
            <span
              style={{
                marginLeft: 8,
                flex: 1,
                borderBottom: isFP || isPBS ? "1px solid #000" : "none",
              }}
            >
              {inv.tinNo}
            </span>
          </div>

          <div
            style={{
              position: "absolute",
              left: xStart + leftWidth,
              top: yStartDetails + rectHeight * 2,
              width: rightWidth,
              height: rectHeight,
              display: "flex",
              alignItems: "center",
              fontSize: "10pt",
            }}
          >
            <span>Terms :</span>
            <span
              style={{
                marginLeft: 8,
                flex: 1,
                borderBottom: isFP || isPBS ? "1px solid #000" : "none",
              }}
            >
              {inv.terms}
            </span>
          </div>

          {/* Extra Fields Row */}
          {isEnclosure && (
            <>
              <div
                style={{
                  position: "absolute",
                  left: xStart,
                  top: yStartExtraFields,
                  width: 250,
                  height: rectHeight,
                  display: "flex",
                  alignItems: "center",
                  fontSize: "10pt",
                }}
              >
                <span>PO # :</span>
                <span style={{ marginLeft: 8 }}>{inv.poNumber}</span>
              </div>
              <div
                style={{
                  position: "absolute",
                  left: xStart + 350,
                  top: yStartExtraFields,
                  width: 250,
                  height: rectHeight,
                  display: "flex",
                  alignItems: "center",
                  fontSize: "10pt",
                }}
              >
                <span>DR # :</span>
                <span style={{ marginLeft: 8 }}>{inv.drNo}</span>
              </div>
              <div
                style={{
                  position: "absolute",
                  left: xStart + 570,
                  top: yStartExtraFields,
                  width: 250,
                  height: rectHeight,
                  display: "flex",
                  alignItems: "center",
                  fontSize: "10pt",
                }}
              >
                <span>S.O # :</span>
                <span style={{ marginLeft: 8 }}>{inv.soNumber}</span>
              </div>
            </>
          )}

          {isFP && (
            <>
              <div
                style={{
                  position: "absolute",
                  left: xStart,
                  top: yStartExtraFields,
                  width: 550,
                  height: rectHeight,
                  display: "flex",
                  alignItems: "center",
                  fontSize: "10pt",
                }}
              >
                <span>For the Kind Attention:</span>
                <span
                  style={{
                    marginLeft: 8,
                    flex: 1,
                    borderBottom: "1px solid #000",
                  }}
                >
                  {inv.attention}
                </span>
              </div>
              <div
                style={{
                  position: "absolute",
                  left: xStart + 572,
                  top: yStartExtraFields,
                  width: 178,
                  height: rectHeight,
                  display: "flex",
                  alignItems: "center",
                  fontSize: "10pt",
                }}
              >
                <span>PO # :</span>
                <span
                  style={{
                    marginLeft: 8,
                    flex: 1,
                    borderBottom: "1px solid #000",
                  }}
                >
                  {inv.poNumber}
                </span>
              </div>
            </>
          )}

          {isPBS && (
            <div
              style={{
                position: "absolute",
                left: xStart + 572,
                top: yStartExtraFields,
                width: 178,
                height: rectHeight,
                display: "flex",
                alignItems: "center",
                fontSize: "10pt",
              }}
            >
              <span>PO # :</span>
              <span
                style={{
                  marginLeft: 8,
                  flex: 1,
                  borderBottom: "1px solid #000",
                }}
              >
                {inv.poNumber}
              </span>
            </div>
          )}

          {/* 12-Row Items Grid + 5-Row VAT Grid */}
          {Array.from({ length: 17 }).map((_, rowIdx) => {
            const top = yStartTable + rowIdx * tableDataHeight;
            const isHeader = rowIdx === 0;
            const dataRow = rowIdx >= 1 && rowIdx <= 11 ? rows[rowIdx - 1] : undefined;
            const isVatSplitRow = rowIdx >= 13 && rowIdx <= 16;

            return (
              <React.Fragment key={rowIdx}>
                {/* Col 1: Description (or VAT Left Box) */}
                <div
                  style={{
                    position: "absolute",
                    left: xDesc,
                    top,
                    width: wDesc,
                    height: tableDataHeight,
                    border: "1px solid #000",
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: isHeader ? "center" : "flex-start",
                    padding: isVatSplitRow ? 0 : "0 6px",
                    fontSize: isHeader ? "9pt" : "8pt",
                  }}
                >
                  {isHeader && "Item Description/ Nature of Service"}
                  {dataRow && (
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {dataRow.description}
                    </span>
                  )}
                  {isVatSplitRow && (
                    <div style={{ display: "flex", width: "100%", height: "100%" }}>
                      <div
                        style={{
                          width: 100,
                          height: "100%",
                          borderRight: "1px solid #000",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          paddingRight: 6,
                          fontSize: "7pt",
                          boxSizing: "border-box",
                        }}
                      >
                        {rowIdx === 13 && "VATable Sales"}
                        {rowIdx === 14 && "VAT"}
                        {rowIdx === 15 && "Zero Rated Sales"}
                        {rowIdx === 16 && "VAT-Exempt Sales"}
                      </div>
                      <div
                        style={{
                          flex: 1,
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          paddingRight: 6,
                          fontSize: "8pt",
                        }}
                      >
                        {rowIdx === 13 &&
                          isVAT &&
                          hasVAT &&
                          amountNetVat > 0 &&
                          formatCurrency(amountNetVat)}
                        {rowIdx === 14 &&
                          isVAT &&
                          hasVAT &&
                          formatCurrency(firstLine.salesTaxTotal)}
                        {rowIdx === 15 &&
                          !(isVAT && hasVAT) &&
                          zeroRatedSalesTotal > 0 &&
                          formatCurrency(zeroRatedSalesTotal)}
                        {rowIdx === 16 &&
                          !(isVAT && hasVAT) &&
                          zeroRatedSalesTotal <= 0 &&
                          vatExemptSalesTotal > 0 &&
                          formatCurrency(vatExemptSalesTotal)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Col 2: Quantity (or Right VAT Labels) */}
                <div
                  style={{
                    position: "absolute",
                    left: xQty,
                    top,
                    width: wQty,
                    height: tableDataHeight,
                    border: "1px solid #000",
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: rowIdx >= 12 ? "flex-end" : "center",
                    padding: "0 6px",
                    fontSize: isHeader ? "9pt" : rowIdx >= 12 ? "7pt" : "8pt",
                  }}
                >
                  {isHeader && "Quantity"}
                  {dataRow && dataRow.quantityText}
                  {rowIdx === 12 && "Total Sales (VAT Inclusive)"}
                  {rowIdx === 13 && "Less: VAT"}
                  {rowIdx === 14 && "Amount: Net of VAT"}
                  {rowIdx === 15 && "Add: VAT"}
                  {rowIdx === 16 && "Less: Witholding Tax"}
                </div>

                {/* Col 3: Unit Cost/Price */}
                <div
                  style={{
                    position: "absolute",
                    left: xPrice,
                    top,
                    width: wPrice,
                    height: tableDataHeight,
                    border: "1px solid #000",
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: isHeader ? "center" : "flex-end",
                    padding: "0 6px",
                    fontSize: isHeader ? "9pt" : "8pt",
                  }}
                >
                  {isHeader && "Unit Cost/ Price"}
                  {dataRow && dataRow.unitPriceText}
                </div>

                {/* Col 4: Amount (or Right VAT Values) */}
                <div
                  style={{
                    position: "absolute",
                    left: xAmt,
                    top,
                    width: wAmt,
                    height: tableDataHeight,
                    border: "1px solid #000",
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: isHeader ? "center" : "flex-end",
                    padding: "0 6px",
                    fontSize: isHeader ? "9pt" : "8pt",
                  }}
                >
                  {isHeader && "Amount"}
                  {dataRow && dataRow.amountText}
                  {rowIdx === 12 &&
                    vatType === "Inclusive" &&
                    firstLine.totalAmount > 0 &&
                    formatCurrency(firstLine.totalAmount)}
                  {rowIdx === 13 &&
                    vatType === "Inclusive" &&
                    firstLine.salesTaxTotal > 0 &&
                    formatCurrency(firstLine.salesTaxTotal)}
                  {rowIdx === 14 && amountNetVat > 0 && formatCurrency(amountNetVat)}
                  {rowIdx === 15 &&
                    firstLine.salesTaxTotal > 0 &&
                    formatCurrency(firstLine.salesTaxTotal)}
                  {rowIdx === 16 && ewtAmount > 0 && formatCurrency(ewtAmount)}
                </div>
              </React.Fragment>
            );
          })}

          {/* Row 17: TOTAL AMOUNT DUE */}
          <div
            style={{
              position: "absolute",
              left: xStart,
              top: yStartTable + tableDataHeight * 17,
              width: maxWidth,
              height: tableDataHeight,
              border: "1px solid #000",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
            }}
          >
            <div style={{ width: wDesc }} />
            <div
              style={{
                width: wQty,
                textAlign: "center",
                fontSize: "8pt",
                fontWeight: 700,
              }}
            >
              TOTAL AMOUNT DUE
            </div>
            <div
              style={{
                width: wPrice + wAmt,
                textAlign: "right",
                paddingRight: 6,
                fontSize: "8pt",
                fontWeight: 700,
              }}
            >
              {totalAmountDue > 0 ? `P${formatCurrency(totalAmountDue)}` : ""}
            </div>
          </div>

          {/* Row 18-19: AMOUNT IN WORDS */}
          <div
            style={{
              position: "absolute",
              left: xStart,
              top: yStartTable + tableDataHeight * 18,
              width: maxWidth,
              height: tableDataHeight * 2,
              border: "1px solid #000",
              boxSizing: "border-box",
              padding: "4px 6px",
              fontSize: "9pt",
              display: "flex",
              alignItems: "flex-start",
            }}
          >
            AMOUNT IN WORDS: {words}
          </div>

          {/* Row 20+: SIGNATORY BOX */}
          <div
            style={{
              position: "absolute",
              left: xStart,
              top: yStartSignatory,
              width: maxWidth,
              height: tableDataHeight * 4 + 10,
              border: "1px solid #000",
              boxSizing: "border-box",
              display: "flex",
              paddingTop: 6,
            }}
          >
            {/* Prepared By */}
            <div
              style={{
                width: 300,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: 8,
              }}
            >
              <div style={{ fontSize: "9pt" }}>PREPARED BY:</div>
              <div
                style={{
                  width: 240,
                  borderBottom: "1px solid #000",
                  textAlign: "center",
                  fontSize: "9pt",
                  minHeight: 20,
                  marginTop: 14,
                }}
              >
                {signatory.preparedBy}
              </div>
              <div style={{ fontSize: "9pt" }}>Signature over Printed Name</div>
            </div>

            {/* Approved By */}
            <div
              style={{
                width: 250,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: 8,
              }}
            >
              <div style={{ fontSize: "9pt" }}>APPROVED BY:</div>
              <div
                style={{
                  width: 210,
                  borderBottom: "1px solid #000",
                  textAlign: "center",
                  fontSize: "9pt",
                  minHeight: 20,
                  marginTop: 14,
                }}
              >
                {signatory.checkedBy}
              </div>
              <div style={{ fontSize: "9pt" }}>Signature over Printed Name</div>
            </div>

            {/* Received By */}
            <div
              style={{
                width: 200,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: 8,
              }}
            >
              <div style={{ fontSize: "9pt" }}>RECEIVED BY:</div>
              <div
                style={{
                  width: 185,
                  borderBottom: "1px solid #000",
                  textAlign: "center",
                  fontSize: "9pt",
                  minHeight: 20,
                  marginTop: 14,
                }}
              >
                {signatory.approvedBy}
              </div>
              <div style={{ fontSize: "9pt" }}>Signature over Printed Name</div>
            </div>
          </div>

          {/* Footer Extra Fields: BIR Permit No, Date Issued, Series Range */}
          <div
            style={{
              position: "absolute",
              left: xStart,
              top: yStartFooter,
              fontSize: "7pt",
              lineHeight: 1.6,
            }}
          >
            <div>
              <span style={{ display: "inline-block", width: 75 }}>BIR Permit No:</span>
              <span>{acNo}</span>
            </div>
            <div>
              <span style={{ display: "inline-block", width: 75 }}>Date Issued :</span>
              <span>{formatDateMMDDYYYY(dateIssued)}</span>
            </div>
            <div>
              <span style={{ display: "inline-block", width: 75 }}>Series Range :</span>
              <span>000001-9999999999</span>
            </div>
          </div>

          {isReprint && (
            <div
              style={{
                position: "absolute",
                left: xStart + 580,
                top: yStartFooter + 75,
                fontSize: "10pt",
                fontWeight: 600,
              }}
            >
              ---REPRINT---
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. NHC — SALES INVOICE & DELIVERY RECEIPT (850 x 1100)
  // =========================================================================
  if (client === "NHC") {
    if (formType === "Sales Invoice") {
      if (!inv) return null;

      const { rows, zeroRatedSalesTotal, vatExemptSalesTotal } = processStandardLineItems(
        invoices,
        vatType,
        enableExpDate
      );

      let soldTo = inv.customerName || "";
      if (soldTo.includes(":")) {
        soldTo = soldTo.split(":")[0].trim();
      }
      const tin = inv.tinNo || inv.customFields?.["TIN"] || "";
      const bStyle =
        businessStyle.trim() !== ""
          ? businessStyle
          : inv.businessStyle || inv.customFields?.["BUSINESS STYLE"] || "";
      const storeCode = inv.storeCode || inv.customFields?.["Store Code"] || "";
      const shipAddr = [
        inv.shipAddress1,
        inv.shipAddress2,
        inv.shipAddress3,
        inv.shipAddress4,
        inv.shipAddress5,
      ]
        .filter(Boolean)
        .join(" ");
      const billAddr = [
        inv.billAddress1,
        inv.billAddress2,
        inv.billAddress3,
        inv.billAddress4,
        inv.billAddress5,
      ]
        .filter(Boolean)
        .join(" ");
      const displayAddress = shipAddr || billAddr;

      let totalVATableAmount = 0;
      for (const invoice of invoices) {
        for (const line of invoice.lineItems) {
          if (line.description === "Subtotal") continue;
          const isLineVATable = line.tax !== "Non" || invoice.taxesName === "Vat";
          if (isLineVATable) {
            const adjusted = line.tax !== "Non" ? line.amount * 1.12 : line.amount;
            totalVATableAmount += adjusted;
          }
        }
      }
      const amountNetVat = totalVATableAmount / 1.12;
      const totalVAT = totalVATableAmount - amountNetVat;
      const ewtAmount = lessEwt1 ? amountNetVat * 0.01 : 0;
      const totalAmountDue = totalVATableAmount - ewtAmount;

      return (
        <div
          className="print-sheet-wrapper"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
        >
          <div
            className="print-sheet"
            style={{
              width: 850,
              height: 1100,
              position: "relative",
              backgroundColor: "#ffffff",
              color: "#000000",
              fontFamily: "'Microsoft Sans Serif', Arial, sans-serif",
              fontSize: "8pt",
            }}
          >
            {showPreprintedGuide && (
              <img
                src="/resources/NATURE SI.jpg"
                alt="NHC SI Guide"
                className="preprinted-guide-img"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "fill",
                  opacity: 0.38,
                  pointerEvents: "none",
                }}
              />
            )}

            <DraggableField fieldKey="date" label="Date" baseLeft={660} baseTop={110} width={110} style={{ textAlign: "center" }} {...dragCommon}>
              {formatDateMMDDYYYY(inv.txnDate)}
            </DraggableField>
            <DraggableField fieldKey="soldTo" label="Sold To" baseLeft={145} baseTop={140} width={285} {...dragCommon}>
              {soldTo}
            </DraggableField>
            <DraggableField fieldKey="businessStyle" label="Business Style" baseLeft={325} baseTop={160} width={285} {...dragCommon}>
              {bStyle}
            </DraggableField>
            <DraggableField fieldKey="tin" label="TIN" baseLeft={145} baseTop={160} width={285} {...dragCommon}>
              {tin}
            </DraggableField>
            <DraggableField fieldKey="address" label="Address" baseLeft={145} baseTop={180} width={485} {...dragCommon}>
              {displayAddress}
            </DraggableField>

            <DraggableField fieldKey="poNo" label="PO No" baseLeft={145} baseTop={205} width={285} {...dragCommon}>
              {inv.poNumber}
            </DraggableField>
            <DraggableField fieldKey="storeCode" label="Store Code" baseLeft={145} baseTop={220} width={285} {...dragCommon}>
              {storeCode}
            </DraggableField>
            <DraggableField fieldKey="terms" label="Terms" baseLeft={145} baseTop={235} width={285} {...dragCommon}>
              {inv.terms}
            </DraggableField>

            {/* Line Items Table starting at Y=280 */}
            <DraggableField fieldKey="itemsTable" label="Items Table" baseLeft={68} baseTop={280} width={720} {...dragCommon}>
              {rows.map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    minHeight: 25,
                    alignItems: "center",
                  }}
                >
                  <div style={{ width: 75, textAlign: "center" }}>{r.quantityText}</div>
                  <div style={{ width: 67, textAlign: "center" }}>{r.uomText}</div>
                  <div style={{ width: 320, paddingLeft: 4 }}>{r.description}</div>
                  <div style={{ width: 109, textAlign: "right" }}>{r.unitPriceText}</div>
                  <div style={{ width: 110, textAlign: "right" }}>{r.amountText}</div>
                </div>
              ))}
              {note.trim() !== "" && (
                <div style={{ marginTop: 8, fontWeight: 700 }}>Note: {note}</div>
              )}
            </DraggableField>

            {/* Left VAT Breakdown (X=230, Y=801) */}
            <DraggableField
              fieldKey="vatLeft"
              label="Left VAT Table"
              baseLeft={230}
              baseTop={801}
              width={150}
              style={{ textAlign: "right" }}
              {...dragCommon}
            >
              <div style={{ height: 18 }}>{amountNetVat > 0 ? formatCurrency(amountNetVat) : ""}</div>
              <div style={{ height: 18 }}>
                {vatExemptSalesTotal > 0 ? formatCurrency(vatExemptSalesTotal) : ""}
              </div>
              <div style={{ height: 18 }}>
                {zeroRatedSalesTotal > 0 ? formatCurrency(zeroRatedSalesTotal) : ""}
              </div>
              <div style={{ height: 18 }}>{totalVAT > 0 ? formatCurrency(totalVAT) : ""}</div>
            </DraggableField>

            {/* Right VAT Summary (X=580, Y=804) */}
            <DraggableField
              fieldKey="vatRight"
              label="Right Totals Table"
              baseLeft={580}
              baseTop={804}
              width={180}
              style={{ textAlign: "right" }}
              {...dragCommon}
            >
              <div style={{ height: 17 }}>
                {totalVATableAmount > 0 ? formatCurrency(totalVATableAmount) : ""}
              </div>
              <div style={{ height: 17 }}>{totalVAT > 0 ? formatCurrency(totalVAT) : ""}</div>
              <div style={{ height: 17 }}>{amountNetVat > 0 ? formatCurrency(amountNetVat) : ""}</div>
              <div style={{ height: 17 }} />
              <div style={{ height: 17 }}>{totalVAT > 0 ? formatCurrency(totalVAT) : ""}</div>
              <div style={{ height: 17 }}>{ewtAmount > 0 ? formatCurrency(ewtAmount) : ""}</div>
              <div style={{ height: 17, fontWeight: 700 }}>
                {totalAmountDue > 0 ? formatCurrency(totalAmountDue) : ""}
              </div>
            </DraggableField>

            {/* Signatory */}
            <DraggableField
              fieldKey="signatory"
              label="Signatory"
              baseLeft={555}
              baseTop={985}
              width={230}
              style={{ textAlign: "center" }}
              {...dragCommon}
            >
              {signatory.cashierName}
            </DraggableField>
          </div>
        </div>
      );
    }

    // NHC Delivery Receipt (AltLayout_NHC.Layout_DeliveryReceipt)
    const tr = transfers[0];
    if (!tr && !inv) return null;

    const firstTrLine = tr?.lines?.[0];
    const autoSiteAddress = firstTrLine
      ? [
          firstTrLine.siteAddr1,
          firstTrLine.siteAddr2,
          firstTrLine.siteAddr3,
          firstTrLine.siteAddr4,
          firstTrLine.siteAddr5,
        ]
          .filter(Boolean)
          .join(", ")
      : "";

    const soldTo =
      drCustomerName.trim() !== ""
        ? drCustomerName
        : firstTrLine?.siteDescription || inv?.customerName || "";
    const displayAddress = drAddress.trim() !== "" ? drAddress : autoSiteAddress;
    const displayDate = formatDateMMDDYYYY(tr?.txnDate || inv?.txnDate || "");

    const sourceLines = tr?.lines || [];
    let runningTotal = 0;

    const renderedDrLines = sourceLines.map((line, idx) => {
      const editedRow = editableLines[idx];
      const exp =
        editedRow && editedRow.expirationDate.trim() !== ""
          ? editedRow.expirationDate.trim()
          : line.expirationDate;

      let desc = line.itemDescription || "";
      if (enableExpDate && exp) {
        desc += ` (EXP: ${exp})`;
      }

      let itemAmount = line.amount;
      if (allowPriceEditing && editedRow && editedRow.price.trim() !== "") {
        const parsed = parseFloat(editedRow.price);
        if (!isNaN(parsed)) {
          itemAmount = parsed;
        }
      }
      runningTotal += itemAmount;

      return {
        qty: formatCurrency(line.quantityTransfer),
        unit: line.baseUnitName || "pcs",
        desc,
        amount: itemAmount,
      };
    });

    const totalEditRow = editableLines.find((r) => r.isTotal);
    let printedTotal = runningTotal;
    if (allowPriceEditing && totalEditRow && totalEditRow.price.trim() !== "") {
      const parsedTotal = parseFloat(totalEditRow.price);
      if (!isNaN(parsedTotal)) {
        printedTotal = parsedTotal;
      }
    }

    return (
      <div
        className="print-sheet-wrapper"
        style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
      >
        <div
          className="print-sheet"
          style={{
            width: 850,
            height: 1100,
            position: "relative",
            backgroundColor: "#ffffff",
            color: "#000000",
            fontFamily: "'Microsoft Sans Serif', Arial, sans-serif",
            fontSize: "8pt",
          }}
        >
          {showPreprintedGuide && (
            <img
              src="/resources/NATURE DR.jpg"
              alt="NHC DR Guide"
              className="preprinted-guide-img"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "fill",
                opacity: 0.38,
                pointerEvents: "none",
              }}
            />
          )}

          <DraggableField fieldKey="date" label="Date" baseLeft={690} baseTop={90} width={120} style={{ textAlign: "center" }} {...dragCommon}>
            {displayDate}
          </DraggableField>
          <DraggableField fieldKey="soldTo" label="Sold To" baseLeft={125} baseTop={135} width={285} {...dragCommon}>
            {soldTo}
          </DraggableField>
          <DraggableField fieldKey="businessStyle" label="Business Style" baseLeft={615} baseTop={138} width={205} {...dragCommon}>
            {businessStyle}
          </DraggableField>
          <DraggableField fieldKey="tin" label="TIN" baseLeft={125} baseTop={155} width={285} {...dragCommon}>
            {drTin}
          </DraggableField>
          <DraggableField fieldKey="address" label="Address" baseLeft={125} baseTop={175} width={500} {...dragCommon}>
            {displayAddress}
          </DraggableField>

          <DraggableField fieldKey="poNo" label="PO No" baseLeft={125} baseTop={205} width={285} {...dragCommon}>
            {drPoNumber}
          </DraggableField>
          <DraggableField fieldKey="storeCode" label="Store Code" baseLeft={125} baseTop={220} width={285} {...dragCommon}>
            {drStoreCode}
          </DraggableField>
          <DraggableField fieldKey="terms" label="Terms" baseLeft={125} baseTop={235} width={285} {...dragCommon}>
            {drTerms}
          </DraggableField>

          {/* Middle Table at Y=285 */}
          <DraggableField fieldKey="itemsTable" label="Items Table" baseLeft={50} baseTop={285} width={700} {...dragCommon}>
            {renderedDrLines.map((row, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  minHeight: 23,
                  alignItems: "center",
                }}
              >
                <div style={{ width: 75, textAlign: "center" }}>{row.qty}</div>
                <div style={{ width: 45, textAlign: "center" }}>{row.unit}</div>
                <div style={{ width: 480, paddingLeft: 4 }}>{row.desc}</div>
                {enableExpDate && (
                  <div style={{ width: 100, textAlign: "right" }}>
                    {formatCurrency(row.amount)}
                  </div>
                )}
              </div>
            ))}

            {enableExpDate && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: 10,
                  fontWeight: 700,
                }}
              >
                <div style={{ width: 100, textAlign: "right", paddingRight: 12 }}>TOTAL:</div>
                <div style={{ width: 100, textAlign: "right" }}>
                  {formatCurrency(printedTotal)}
                </div>
              </div>
            )}

            {note.trim() !== "" && (
              <div style={{ marginTop: 10, fontWeight: 700 }}>Note: {note}</div>
            )}
          </DraggableField>

          {/* Signatory */}
          <DraggableField
            fieldKey="signatory"
            label="Signatory"
            baseLeft={555}
            baseTop={915}
            width={230}
            style={{ textAlign: "center" }}
            {...dragCommon}
          >
            {signatory.cashierName}
          </DraggableField>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 3. MET — SALES INVOICE & DELIVERY RECEIPT (850 x 1100)
  // =========================================================================
  if (client === "MET") {
    if (!inv) return null;

    const shipAddr = [
      inv.shipAddress1,
      inv.shipAddress2,
      inv.shipAddress3,
      inv.shipAddress4,
      inv.shipAddress5,
    ]
      .filter(Boolean)
      .join(" ");
    const billAddr = [
      inv.billAddress1,
      inv.billAddress2,
      inv.billAddress3,
      inv.billAddress4,
      inv.billAddress5,
    ]
      .filter(Boolean)
      .join(" ");
    const displayAddr = shipAddr || billAddr;
    const tin = inv.tinNo || inv.customFields?.["TIN"] || "";

    if (formType === "Sales Invoice") {
      const { rows } = processStandardLineItems(invoices, "Exclusive", enableExpDate);

      let totalSales = 0;
      for (const invoice of invoices) {
        for (const li of invoice.lineItems) {
          if (li.description !== "Subtotal") {
            totalSales += li.amount;
          }
        }
      }
      const amountNetVat = totalSales / 1.12;
      const totalVAT = totalSales - amountNetVat;
      const ewtAmount = lessEwt1
        ? (vatType === "Inclusive" ? amountNetVat : totalSales) * 0.01
        : 0;
      const totalAmountDue = totalSales - ewtAmount;
      const words = amountToWords(inv.totalAmount || totalSales);

      return (
        <div
          className="print-sheet-wrapper"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
        >
          <div
            className="print-sheet"
            style={{
              width: 850,
              height: 1100,
              position: "relative",
              backgroundColor: "#ffffff",
              color: "#000000",
              fontFamily: "'Microsoft Sans Serif', Arial, sans-serif",
              fontSize: "8pt",
            }}
          >
            {showPreprintedGuide && (
              <img
                src="/resources/MET Invoice.jpg"
                alt="MET SI Guide"
                className="preprinted-guide-img"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "fill",
                  opacity: 0.38,
                  pointerEvents: "none",
                }}
              />
            )}

            <DraggableField fieldKey="date" label="Date" baseLeft={460} baseTop={145} width={120} style={{ textAlign: "center" }} {...dragCommon}>
              {formatDateMMDDYYYY(inv.txnDate)}
            </DraggableField>
            <DraggableField fieldKey="soldTo" label="Sold To" baseLeft={80} baseTop={190} width={285} {...dragCommon}>
              {inv.customerName}
            </DraggableField>
            <DraggableField fieldKey="tin" label="TIN" baseLeft={80} baseTop={215} width={285} {...dragCommon}>
              {tin}
            </DraggableField>
            <DraggableField fieldKey="terms" label="Terms" baseLeft={395} baseTop={215} width={170} {...dragCommon}>
              {inv.terms}
            </DraggableField>
            <DraggableField fieldKey="poNo" label="PO No" baseLeft={565} baseTop={215} width={180} {...dragCommon}>
              {inv.poNumber}
            </DraggableField>
            <DraggableField fieldKey="address" label="Address" baseLeft={80} baseTop={240} width={485} {...dragCommon}>
              {displayAddr}
            </DraggableField>
            <DraggableField fieldKey="amountInWords" label="Amount in Words" baseLeft={80} baseTop={270} width={500} {...dragCommon}>
              {words}
            </DraggableField>

            {/* Middle Table (Y=310) */}
            <DraggableField fieldKey="itemsTable" label="Items Table" baseLeft={65} baseTop={310} width={640} {...dragCommon}>
              {rows.map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    minHeight: 16,
                    alignItems: "center",
                  }}
                >
                  <div style={{ width: 320 }}>{r.description}</div>
                  <div style={{ width: 60, textAlign: "center" }}>{r.quantityText}</div>
                  <div style={{ width: 80, textAlign: "right" }}>{r.unitPriceText}</div>
                  <div style={{ width: 110, textAlign: "right" }}>{r.amountText}</div>
                </div>
              ))}
              {note.trim() !== "" && (
                <div style={{ marginTop: 8, fontWeight: 700 }}>Note: {note}</div>
              )}
            </DraggableField>

            {/* Left VAT Table (X=160, Y=634) */}
            <DraggableField
              fieldKey="vatLeft"
              label="Left VAT Table"
              baseLeft={160}
              baseTop={634}
              width={150}
              style={{ textAlign: "right" }}
              {...dragCommon}
            >
              <div style={{ height: 20 }}>
                {vatType === "Inclusive" && amountNetVat > 0 ? formatCurrency(amountNetVat) : ""}
              </div>
              <div style={{ height: 20 }}>
                {vatType === "Inclusive" && totalVAT > 0 ? formatCurrency(totalVAT) : ""}
              </div>
              <div style={{ height: 20 }} />
              <div style={{ height: 20 }}>
                {vatType === "Exclusive" && totalSales > 0 ? formatCurrency(totalSales) : ""}
              </div>
            </DraggableField>

            {/* Right Summary Table (X=455, Y=571) */}
            <DraggableField
              fieldKey="vatRight"
              label="Right Summary Table"
              baseLeft={455}
              baseTop={571}
              width={180}
              style={{ textAlign: "right" }}
              {...dragCommon}
            >
              <div style={{ height: 20 }}>
                {vatType === "Inclusive" && totalSales > 0 ? formatCurrency(totalSales) : ""}
              </div>
              <div style={{ height: 20 }}>
                {vatType === "Inclusive" && totalVAT > 0 ? formatCurrency(totalVAT) : ""}
              </div>
              <div style={{ height: 20 }}>
                {vatType === "Inclusive" && amountNetVat > 0 ? formatCurrency(amountNetVat) : ""}
              </div>
              <div style={{ height: 20 }} />
              <div style={{ height: 20 }} />
              <div style={{ height: 20 }}>{ewtAmount > 0 ? formatCurrency(ewtAmount) : ""}</div>
              <div style={{ height: 20, fontWeight: 700 }}>
                {totalAmountDue > 0 ? formatCurrency(totalAmountDue) : ""}
              </div>
            </DraggableField>

            {/* Signatory */}
            <DraggableField
              fieldKey="signatory"
              label="Signatory"
              baseLeft={340}
              baseTop={780}
              width={230}
              style={{ textAlign: "center" }}
              {...dragCommon}
            >
              {signatory.cashierName}
            </DraggableField>
          </div>
        </div>
      );
    }

    // MET Delivery Receipt
    let totalDrAmount = 0;
    const drItems = inv.lineItems
      .filter((l) => l.description !== "Subtotal")
      .map((l) => {
        let desc = l.description || "";
        if (enableExpDate && l.expirationDate) {
          desc += ` (EXP: ${l.expirationDate})`;
        }
        totalDrAmount += l.amount;
        return {
          qty: String(l.quantity),
          unit: l.unitOfMeasure || "",
          desc,
          amount: l.amount,
        };
      });

    return (
      <div
        className="print-sheet-wrapper"
        style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
      >
        <div
          className="print-sheet"
          style={{
            width: 850,
            height: 1100,
            position: "relative",
            backgroundColor: "#ffffff",
            color: "#000000",
            fontFamily: "'Microsoft Sans Serif', Arial, sans-serif",
            fontSize: "8pt",
          }}
        >
          {showPreprintedGuide && (
            <img
              src="/resources/viber_image_2026-01-14_13-36-47-109.jpg"
              alt="MET DR Guide"
              className="preprinted-guide-img"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "fill",
                opacity: 0.38,
                pointerEvents: "none",
              }}
            />
          )}

          <DraggableField fieldKey="soldTo" label="Sold To" baseLeft={150} baseTop={145} width={285} {...dragCommon}>
            {inv.customerName}
          </DraggableField>
          <DraggableField fieldKey="date" label="Date" baseLeft={470} baseTop={145} width={120} style={{ textAlign: "center" }} {...dragCommon}>
            {formatDateMMDDYYYY(inv.dueDate || inv.txnDate)}
          </DraggableField>
          <DraggableField fieldKey="businessStyle" label="Business Style" baseLeft={150} baseTop={148} width={205} {...dragCommon}>
            {businessStyle}
          </DraggableField>
          <DraggableField fieldKey="tin" label="TIN" baseLeft={125} baseTop={165} width={285} {...dragCommon}>
            {tin}
          </DraggableField>
          <DraggableField fieldKey="terms" label="Terms" baseLeft={500} baseTop={165} width={285} {...dragCommon}>
            {inv.terms}
          </DraggableField>
          <DraggableField fieldKey="address" label="Address" baseLeft={130} baseTop={185} width={500} {...dragCommon}>
            {displayAddr}
          </DraggableField>
          <DraggableField fieldKey="poNo" label="PO No" baseLeft={125} baseTop={215} width={285} {...dragCommon}>
            {inv.poNumber}
          </DraggableField>

          {/* Table Middle Y=265 */}
          <DraggableField fieldKey="itemsTable" label="Items Table" baseLeft={70} baseTop={265} width={640} {...dragCommon}>
            {drItems.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  minHeight: 23,
                  alignItems: "center",
                }}
              >
                <div style={{ width: 75, textAlign: "center" }}>{item.qty}</div>
                <div style={{ width: 45, textAlign: "center" }}>{item.unit}</div>
                <div style={{ width: 420 }}>{item.desc}</div>
                {enableExpDate && (
                  <div style={{ width: 100, textAlign: "right" }}>
                    {formatCurrency(item.amount)}
                  </div>
                )}
              </div>
            ))}

            {enableExpDate && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: 10,
                  fontWeight: 700,
                }}
              >
                <div style={{ width: 100, textAlign: "right", paddingRight: 12 }}>TOTAL:</div>
                <div style={{ width: 100, textAlign: "right" }}>
                  {formatCurrency(totalDrAmount)}
                </div>
              </div>
            )}

            {note.trim() !== "" && (
              <div style={{ marginTop: 10, fontWeight: 700 }}>Note: {note}</div>
            )}
          </DraggableField>

          <DraggableField
            fieldKey="signatory"
            label="Signatory"
            baseLeft={555}
            baseTop={915}
            width={230}
            style={{ textAlign: "center" }}
            {...dragCommon}
          >
            {signatory.cashierName}
          </DraggableField>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 4. IVP — COLLECTION RECEIPT (850 x 1100)
  // =========================================================================
  if (client === "IVP") {
    if (!inv) return null;

    const payee = inv.customerName || "";
    const totalAmt =
      inv.totalAmount > 0 ? inv.totalAmount : inv.balanceRemaining || inv.subtotal || 0;
    const words = amountToWords(totalAmt);
    const offsetY = 105;

    return (
      <div
        className="print-sheet-wrapper"
        style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
      >
        <div
          className={`print-sheet ${ivpRotatePrint ? "ivp-rotated-sheet" : ""}`}
          style={{
            width: 850,
            height: 1100,
            position: "relative",
            backgroundColor: "#ffffff",
            color: "#000000",
            fontFamily: "'Microsoft Sans Serif', Arial, sans-serif",
          }}
        >
          {showPreprintedGuide && (
            <img
              src="/resources/Collection_Receipt_page-0001.jpg"
              alt="IVP Collection Receipt Guide"
              className="preprinted-guide-img"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "fill",
                opacity: 0.38,
                pointerEvents: "none",
              }}
            />
          )}

          {/* Left Applied Invoice Table */}
          <DraggableField
            fieldKey="appliedRef"
            label="Applied Ref"
            baseLeft={30}
            baseTop={210 - offsetY}
            width={90}
            height={20}
            style={{
              fontSize: "7pt",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            {...dragCommon}
          >
            {inv.refNumber}
          </DraggableField>
          <DraggableField
            fieldKey="appliedAmt"
            label="Applied Amount"
            baseLeft={105}
            baseTop={210 - offsetY}
            width={90}
            height={20}
            style={{
              fontSize: "7pt",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
            }}
            {...dragCommon}
          >
            {formatCurrency(totalAmt)}
          </DraggableField>

          {/* Total line amount */}
          <DraggableField
            fieldKey="totalLineAmt"
            label="Total Line Amount"
            baseLeft={105}
            baseTop={210 - offsetY + 110}
            width={90}
            height={20}
            style={{
              fontSize: "7pt",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
            }}
            {...dragCommon}
          >
            {formatCurrency(totalAmt)}
          </DraggableField>

          {/* Payee */}
          <DraggableField
            fieldKey="payee"
            label="Payee"
            baseLeft={370}
            baseTop={320 - offsetY - 20}
            width={300}
            height={20}
            style={{
              fontSize: "10pt",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
            }}
            {...dragCommon}
          >
            {payee}
          </DraggableField>

          {/* Amount in Words */}
          <DraggableField
            fieldKey="amountInWords"
            label="Amount in Words"
            baseLeft={280}
            baseTop={373 - offsetY - 25}
            width={370}
            height={40}
            style={{
              fontSize: "10pt",
              fontWeight: 700,
              lineHeight: 1.35,
            }}
            {...dragCommon}
          >
            {"\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0"}
            {words}
          </DraggableField>

          {/* Numeric Amount */}
          <DraggableField
            fieldKey="numericAmt"
            label="Numeric Amount"
            baseLeft={575}
            baseTop={395 - offsetY - 20}
            width={130}
            height={20}
            style={{
              fontSize: "10pt",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
            }}
            {...dragCommon}
          >
            {formatCurrency(totalAmt)}
          </DraggableField>

          {/* Authorize Signature */}
          <DraggableField
            fieldKey="signatory"
            label="Authorize Signature"
            baseLeft={550}
            baseTop={470 - offsetY - 20}
            width={150}
            height={20}
            style={{
              fontSize: "10pt",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            {...dragCommon}
          >
            {signatory.preparedBy}
          </DraggableField>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 5. MEDILIGHT INCORPORATED — SALES INVOICE (850 x 1100)
  // =========================================================================
  if (client === "MEDILIGHT") {
    if (!inv) return null;

    const soldTo = (inv.customerName || "").split(":")[0].trim();
    const tin = inv.tinNo || inv.customFields?.["TIN"] || "";
    const bName =
      businessStyle.trim() !== ""
        ? businessStyle
        : inv.businessStyle || inv.customFields?.["BUSINESS STYLE"] || soldTo;

    const rawAddrParts = [
      inv.billAddress1,
      inv.billAddress2,
      inv.billAddress3,
      inv.billAddress4,
      inv.billAddress5,
      inv.shipAddress1,
      inv.shipAddress2,
      inv.shipAddress3,
    ]
      .map((p) => (p || "").trim())
      .filter((p) => p !== "" && p.toLowerCase() !== soldTo.toLowerCase());

    const uniqueAddrParts = Array.from(new Set(rawAddrParts));
    const addrLine1 = uniqueAddrParts[0] || "";
    const addrLine2 = uniqueAddrParts.slice(1).join(", ");

    let vatableNetTotal = 0;
    let zeroRatedSalesTotal = 0;
    let vatExemptSalesTotal = 0;
    let rawLinesSum = 0;

    const medilightLines = (inv.lineItems || [])
      .filter((li) => li.description !== "Subtotal")
      .map((li) => {
        const isTaxable =
          li.salesTaxTotal !== 0 &&
          li.tax !== "Non" &&
          li.taxesName !== "Out of State" &&
          li.taxesName !== "Zero Rated Sales" &&
          li.taxesName !== "Vat Exempt";

        if (li.taxesName === "Zero Rated Sales" || inv.taxesName === "Zero rated sales") {
          zeroRatedSalesTotal += li.amount;
        } else if (li.taxesName === "Vat Exempt" || inv.taxesName === "Vat Exempt") {
          vatExemptSalesTotal += li.amount;
        } else if (isTaxable) {
          vatableNetTotal += li.amount;
        }
        rawLinesSum += li.amount;

        const qtyDisplay =
          li.quantity > 0
            ? Number.isInteger(li.quantity)
              ? String(li.quantity)
              : formatCurrency(li.quantity)
            : "";

        // Format unit price up to 4 decimals if fractional beyond 2 decimals (e.g. 651.7853)
        let rateDisplay = "";
        if (li.rate !== 0) {
          const fixed4 = li.rate.toFixed(4);
          rateDisplay = fixed4.endsWith("00")
            ? formatCurrency(li.rate)
            : Number(fixed4).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4,
              });
        }

        const amtDisplay = formatCurrency(li.amount);

        const extraSubline =
          enableExpDate && (li.skuCode || li.expirationDate)
            ? [li.skuCode, li.expirationDate].filter(Boolean).join(" ")
            : "";

        return {
          qtyDisplay,
          unitDisplay: li.unitOfMeasure || "",
          description: li.description || li.itemName || "",
          extraSubline,
          rateDisplay,
          amtDisplay,
        };
      });

    const amountNetVat =
      inv.subtotal > 0 ? inv.subtotal : vatableNetTotal > 0 ? vatableNetTotal : rawLinesSum;
    const totalVat =
      inv.salesTaxTotal > 0
        ? inv.salesTaxTotal
        : vatableNetTotal > 0
        ? +(amountNetVat * 0.12).toFixed(2)
        : 0;
    const totalSalesInclusive = amountNetVat + totalVat;

    let ewtAmount = 0;
    const parsedManual = parseFloat(manualEwtAmount);
    if (!isNaN(parsedManual) && parsedManual > 0) {
      ewtAmount = parsedManual;
    } else if (lessEwt1) {
      ewtAmount = amountNetVat * 0.01;
    } else if (lessEwt2) {
      ewtAmount = amountNetVat * 0.02;
    }

    const totalAmountDue = totalSalesInclusive - ewtAmount;

    // Convert "Fourteen Thousand Six Hundred Pesos Only" -> "PESOS: FOURTEEN THOUSAND SIX HUNDRED ONLY"
    const rawWords = amountToWords(totalAmountDue).toUpperCase();
    const formattedPesosWords = `PESOS: ${rawWords
      .replace(/\s+PESOS\s+AND\s+/g, " AND ")
      .replace(/\s+PESOS\s+ONLY$/g, " ONLY")}`;

    return (
      <div
        className="print-sheet-wrapper"
        style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
      >
        <div
          className="print-sheet"
          style={{
            width: 850,
            height: 1100,
            position: "relative",
            backgroundColor: "#ffffff",
            color: "#000000",
            fontFamily: "'Times New Roman', Georgia, serif",
            fontSize: "9.5pt",
          }}
        >
          {showPreprintedGuide && (
            <img
              src="/resources/MEDILIGHT SI.jpg"
              alt="Medilight Sales Invoice Guide"
              className="preprinted-guide-img"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "fill",
                opacity: 0.42,
                pointerEvents: "none",
              }}
            />
          )}

          {/* TOP LEFT HEADER: Sold to, Business Name, Business Address */}
          <DraggableField fieldKey="soldTo" label="Sold To" baseLeft={138} baseTop={155} width={410} {...dragCommon}>
            {soldTo}
          </DraggableField>
          <DraggableField fieldKey="businessName" label="Business Name" baseLeft={155} baseTop={196} width={395} {...dragCommon}>
            {bName}
          </DraggableField>
          <DraggableField fieldKey="addrLine1" label="Address Line 1" baseLeft={168} baseTop={223} width={390} {...dragCommon}>
            {addrLine1}
          </DraggableField>
          <DraggableField fieldKey="addrLine2" label="Address Line 2" baseLeft={125} baseTop={250} width={430} {...dragCommon}>
            {addrLine2}
          </DraggableField>

          {/* TOP RIGHT HEADER: Date, TIN, P.O. No, Terms */}
          <DraggableField fieldKey="date" label="Date" baseLeft={635} baseTop={155} width={175} {...dragCommon}>
            {formatDateLong(inv.txnDate)}
          </DraggableField>
          <DraggableField fieldKey="tin" label="TIN" baseLeft={635} baseTop={188} width={175} {...dragCommon}>
            {tin}
          </DraggableField>
          <DraggableField fieldKey="poNo" label="P.O. No" baseLeft={638} baseTop={217} width={175} {...dragCommon}>
            {inv.poNumber}
          </DraggableField>
          <DraggableField fieldKey="terms" label="Terms" baseLeft={642} baseTop={247} width={170} {...dragCommon}>
            {inv.terms}
          </DraggableField>

          {/* ARTICLES TABLE (Starts at Y=312, Row Height ~23.5px) */}
          <DraggableField fieldKey="articlesTable" label="Articles Table" baseLeft={35} baseTop={312} width={785} {...dragCommon}>
            {medilightLines.map((item, idx) => (
              <React.Fragment key={idx}>
                <div
                  style={{
                    display: "flex",
                    minHeight: 23.5,
                    alignItems: "center",
                  }}
                >
                  <div style={{ width: 47, textAlign: "center" }}>{item.qtyDisplay}</div>
                  <div style={{ width: 53, textAlign: "center" }}>{item.unitDisplay}</div>
                  <div
                    style={{
                      width: 420,
                      paddingLeft: 28,
                      whiteSpace: "pre-line",
                    }}
                  >
                    {item.description}
                  </div>
                  <div style={{ width: 121, textAlign: "center" }}>{item.rateDisplay}</div>
                  <div
                    style={{
                      width: 144,
                      textAlign: "right",
                      paddingRight: 20,
                    }}
                  >
                    {item.amtDisplay}
                  </div>
                </div>
                {item.extraSubline && (
                  <div
                    style={{
                      display: "flex",
                      minHeight: 23.5,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ width: 100 }} />
                    <div style={{ width: 420, paddingLeft: 28 }}>{item.extraSubline}</div>
                  </div>
                )}
              </React.Fragment>
            ))}

            {/* Blank Spacer Row + Note inside Description column */}
            {note.trim() !== "" && (
              <div
                style={{
                  display: "flex",
                  minHeight: 23.5,
                  alignItems: "center",
                  marginTop: 23.5,
                }}
              >
                <div style={{ width: 100 }} />
                <div style={{ width: 420, paddingLeft: 28 }}>Note: {note}</div>
              </div>
            )}

            {/* PESOS: <AMOUNT IN WORDS> inside Description column */}
            <div
              style={{
                display: "flex",
                minHeight: 23.5,
                alignItems: "center",
                marginTop: 23.5,
              }}
            >
              <div style={{ width: 100 }} />
              <div style={{ width: 435, paddingLeft: 28 }}>{formattedPesosWords}</div>
            </div>
          </DraggableField>

          {/* BOTTOM LEFT VAT BREAKDOWN (X=273..418) */}
          <DraggableField
            fieldKey="vatLeft"
            label="Left VAT Breakdown"
            baseLeft={273}
            baseTop={699}
            width={142}
            style={{
              textAlign: "right",
              paddingRight: 8,
            }}
            {...dragCommon}
          >
            <div style={{ height: 23.6, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              {amountNetVat > 0 ? `PHP ${formatCurrency(amountNetVat)}` : ""}
            </div>
            <div style={{ height: 23.6, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              {totalVat > 0 ? `PHP ${formatCurrency(totalVat)}` : ""}
            </div>
            <div style={{ height: 23.6, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              {zeroRatedSalesTotal > 0 ? `PHP ${formatCurrency(zeroRatedSalesTotal)}` : ""}
            </div>
            <div style={{ height: 23.6, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              {vatExemptSalesTotal > 0 ? `PHP ${formatCurrency(vatExemptSalesTotal)}` : ""}
            </div>
          </DraggableField>

          {/* BOTTOM RIGHT SUMMARY (X=676..820) */}
          <DraggableField
            fieldKey="vatRight"
            label="Right Totals Summary"
            baseLeft={676}
            baseTop={652}
            width={144}
            style={{
              textAlign: "right",
              paddingRight: 18,
            }}
            {...dragCommon}
          >
            {/* Row 1: Total Sales (VAT Inclusive) */}
            <div style={{ height: 23.6, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              {totalSalesInclusive > 0 ? `PHP ${formatCurrency(totalSalesInclusive)}` : ""}
            </div>
            {/* Row 2: Less: VAT */}
            <div style={{ height: 23.6, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              {vatType === "Exclusive" && totalVat > 0 ? `PHP ${formatCurrency(totalVat)}` : ""}
            </div>
            {/* Row 3: Amount: Net of VAT */}
            <div style={{ height: 23.6, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              {amountNetVat > 0 ? `PHP ${formatCurrency(amountNetVat)}` : ""}
            </div>
            {/* Row 4: Less: Discount */}
            <div style={{ height: 23.6, display: "flex", alignItems: "center", justifyContent: "flex-end" }} />
            {/* Row 5: Add: VAT */}
            <div style={{ height: 23.6, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              {totalVat > 0 ? `PHP ${formatCurrency(totalVat)}` : ""}
            </div>
            {/* Row 6: Less: Withholding Tax */}
            <div style={{ height: 23.6, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              {ewtAmount > 0 ? `PHP ${formatCurrency(ewtAmount)}` : ""}
            </div>
            {/* Row 7: TOTAL AMOUNT DUE */}
            <div
              style={{
                height: 23.6,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                fontWeight: 700,
              }}
            >
              {totalAmountDue > 0 ? `PHP ${formatCurrency(totalAmountDue)}` : ""}
            </div>
          </DraggableField>

          {/* BOTTOM RIGHT SIGNATORY (Cashier / Authorized Representative) */}
          <DraggableField
            fieldKey="signatory"
            label="Signatory"
            baseLeft={555}
            baseTop={922}
            width={245}
            style={{ textAlign: "center" }}
            {...dragCommon}
          >
            {signatory.cashierName}
          </DraggableField>
        </div>
      </div>
    );
  }

  return null;
};
