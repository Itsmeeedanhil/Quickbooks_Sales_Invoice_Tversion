import React, { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Building2,
  CheckCircle2,
  Database,
  Eye,
  FileText,
  KeyRound,
  Layers,
  Lock,
  Minus,
  Move,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  ClientId,
  DbStatus,
  EditableDRLine,
  FormType,
  InvoiceData,
  LayoutOffsetsMap,
  SignatoryData,
  TransferInventoryData,
} from "./types";
import {
  getAppDeploymentConfig,
  getClientConfig,
  getLayoutOffsets,
  resetQbPermission,
  saveAppDeploymentConfig,
  saveHistoryDr,
  saveLayoutOffsets,
  searchDocument,
  updateAcNoAndDate,
  updateSeriesNumber,
  updateSignatory,
  verifyProgrammerPasscode,
} from "./services/api";
import {
  formatSeriesNumber,
  toInputDateValue,
} from "./utils/amountToWords";
import { InvoiceCanvasPreview } from "./components/InvoiceCanvasPreview";
import "./App.css";

const CLIENTS: { id: ClientId; label: string; subtitle: string; forms: FormType[] }[] = [
  {
    id: "Enclosure",
    label: "Enclosure",
    subtitle: "Enclosure Systems Specialists, Inc.",
    forms: ["Sales Invoice"],
  },
  {
    id: "FP",
    label: "FP",
    subtitle: "FP Philippines, Inc.",
    forms: ["Sales Invoice"],
  },
  {
    id: "PBS",
    label: "PBS",
    subtitle: "Plan B Solutions Inc.",
    forms: ["Sales Invoice"],
  },
  {
    id: "NHC",
    label: "NHC",
    subtitle: "Nature's Harvest Corp. (SI & DR)",
    forms: ["Sales Invoice", "Delivery Receipt"],
  },
  {
    id: "MET",
    label: "MET",
    subtitle: "MET (Sales Invoice & Delivery Receipt)",
    forms: ["Sales Invoice", "Delivery Receipt"],
  },
  {
    id: "IVP",
    label: "IVP",
    subtitle: "QuickBooks Collection Receipt",
    forms: ["Collection Receipt"],
  },
  {
    id: "MEDILIGHT",
    label: "MEDILIGHT",
    subtitle: "Medilight Incorporated (Sales Invoice)",
    forms: ["Sales Invoice"],
  },
];

export function App() {
  const baseId = useId();

  // Deployment / Enabled Clients State (controlled by Programmer Mode)
  const [enabledClients, setEnabledClients] = useState<ClientId[]>([
    "Enclosure",
    "FP",
    "PBS",
    "NHC",
    "MET",
    "IVP",
    "MEDILIGHT",
  ]);

  // Active Client & Form
  const [client, setClient] = useState<ClientId>("Enclosure");
  const [formType, setFormType] = useState<FormType>("Sales Invoice");

  // Programmer Mode State
  const [progUnlocked, setProgUnlocked] = useState<boolean>(false);
  const [progPasscode, setProgPasscode] = useState<string>("");
  const [progNewPasscode, setProgNewPasscode] = useState<string>("");
  const [progError, setProgError] = useState<string>("");
  const [draftEnabledClients, setDraftEnabledClients] = useState<ClientId[]>([
    "Enclosure",
  ]);
  const [draftDefaultClient, setDraftDefaultClient] =
    useState<ClientId>("Enclosure");

  // Series Number
  const [seriesNumber, setSeriesNumber] = useState<number>(1);
  const [seriesInputText, setSeriesInputText] = useState<string>("000001");

  // Search Reference Number (starts empty — live QuickBooks query only)
  const [refNumber, setRefNumber] = useState<string>("");
  const [refError, setRefError] = useState<string>("");

  // Details Panel Controls
  const [note, setNote] = useState<string>("");
  const [businessStyle, setBusinessStyle] = useState<string>("");
  const [pwdSignature] = useState<string>("");
  const [acNo, setAcNo] = useState<string>("");
  const [dateIssued, setDateIssued] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [includeDateIssued, setIncludeDateIssued] = useState<boolean>(false);
  const [enableExpDate, setEnableExpDate] = useState<boolean>(true);
  const [lessEwt1, setLessEwt1] = useState<boolean>(false);
  const [lessEwt2, setLessEwt2] = useState<boolean>(false);
  const [manualEwtAmount, setManualEwtAmount] = useState<string>("");
  const [isReprint, setIsReprint] = useState<boolean>(false);
  const [vatType, setVatType] = useState<"Inclusive" | "Exclusive">("Inclusive");

  // Delivery Receipt Extra Details (NHC / MET)
  const [drCustomerName, setDrCustomerName] = useState<string>("");
  const [drAddress, setDrAddress] = useState<string>("");
  const [drTerms, setDrTerms] = useState<string>("");
  const [drStoreCode, setDrStoreCode] = useState<string>("");
  const [drPoNumber, setDrPoNumber] = useState<string>("");
  const [drTin, setDrTin] = useState<string>("");

  // Editable Line Items Grid (NHC / MET Delivery Receipt)
  const [editableLines, setEditableLines] = useState<EditableDRLine[]>([]);
  const [showDrEditor, setShowDrEditor] = useState<boolean>(false);
  const [allowPriceEditing, setAllowPriceEditing] = useState<boolean>(true);

  // Signatory
  const [signatory, setSignatory] = useState<SignatoryData>({
    preparedBy: "",
    checkedBy: "",
    approvedBy: "",
    cashierName: "",
  });

  // Search Results & Preview State
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [transfers, setTransfers] = useState<TransferInventoryData[]>([]);
  const [hasPreview, setHasPreview] = useState<boolean>(false);
  const [dataSourceLabel, setDataSourceLabel] = useState<string>("");
  const [zoom, setZoom] = useState<number>(0.85);
  const [showPreprintedGuide, setShowPreprintedGuide] = useState<boolean>(true);
  const [ivpRotatePrint, setIvpRotatePrint] = useState<boolean>(false);

  // Pre-printed Layout Position Adjustment State
  const [adjustMode, setAdjustMode] = useState<boolean>(false);
  const [selectedField, setSelectedField] = useState<string>("__page__");
  const [layoutOffsets, setLayoutOffsets] = useState<LayoutOffsetsMap>({});
  const [dragAnnouncement, setDragAnnouncement] = useState<string>("");

  // Database Status & Notifications
  const [dbStatus, setDbStatus] = useState<DbStatus>({
    accdbConnected: false,
    accdbPath: "",
    sqlitePath: "",
    qbfcAvailable: false,
  });
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: "info" | "success" | "error";
    text: string;
  } | null>(null);

  // Native <dialog> refs
  const drEditDialogRef = useRef<HTMLDialogElement>(null);
  const progDialogRef = useRef<HTMLDialogElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const brandClickTimestampsRef = useRef<number[]>([]);

  const visibleClients = CLIENTS.filter((c) => enabledClients.includes(c.id));
  const currentClientMeta =
    CLIENTS.find((c) => c.id === client) || visibleClients[0] || CLIENTS[0];

  // Load initial deployment configuration (enabled clients & default client)
  useEffect(() => {
    let mounted = true;
    async function initDeployment() {
      try {
        const cfg = await getAppDeploymentConfig();
        if (!mounted) return;
        if (cfg.enabledClients && cfg.enabledClients.length > 0) {
          setEnabledClients(cfg.enabledClients);
          setClient(cfg.defaultClient || cfg.enabledClients[0]);
        }
      } catch {
        // Keep default if running outside Tauri
      }
    }
    initDeployment();
    return () => {
      mounted = false;
    };
  }, []);

  // Hidden Programmer Shortcut: Ctrl + Shift + F12 (or Ctrl + Alt + P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey && e.shiftKey && e.key === "F12") ||
        (e.ctrlKey && e.altKey && e.key.toLowerCase() === "p")
      ) {
        e.preventDefault();
        openProgrammerModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledClients, client]);

  const openProgrammerModal = () => {
    setProgUnlocked(false);
    setProgPasscode("");
    setProgNewPasscode("");
    setProgError("");
    setDraftEnabledClients([...enabledClients]);
    setDraftDefaultClient(client);
    progDialogRef.current?.showModal();
  };

  // Secret 5-click trigger on the Q B S I brand badge
  const handleBrandBadgeSecretClick = () => {
    const now = Date.now();
    const recent = brandClickTimestampsRef.current.filter((t) => now - t < 2000);
    recent.push(now);
    brandClickTimestampsRef.current = recent;
    if (recent.length >= 5) {
      brandClickTimestampsRef.current = [];
      openProgrammerModal();
    }
  };

  const handleUnlockProgrammer = async (e: React.FormEvent) => {
    e.preventDefault();
    setProgError("");
    try {
      const ok = await verifyProgrammerPasscode(progPasscode);
      if (ok) {
        setProgUnlocked(true);
      } else {
        setProgError("Incorrect programmer passcode.");
      }
    } catch (err) {
      setProgError(`Verification error: ${String(err)}`);
    }
  };

  const handleToggleDraftClient = (targetId: ClientId) => {
    if (draftEnabledClients.includes(targetId)) {
      if (draftEnabledClients.length <= 1) {
        setProgError("At least one client must remain enabled.");
        return;
      }
      const next = draftEnabledClients.filter((c) => c !== targetId);
      setDraftEnabledClients(next);
      if (draftDefaultClient === targetId) {
        setDraftDefaultClient(next[0]);
      }
      setProgError("");
    } else {
      setDraftEnabledClients([...draftEnabledClients, targetId]);
      setProgError("");
    }
  };

  const handleIsolateSingleClient = (targetId: ClientId) => {
    setDraftEnabledClients([targetId]);
    setDraftDefaultClient(targetId);
    setProgError("");
  };

  const handleSaveProgrammerConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setProgError("");
    try {
      const updated = await saveAppDeploymentConfig(
        progPasscode,
        draftEnabledClients,
        draftDefaultClient,
        progNewPasscode.trim() || undefined
      );
      setEnabledClients(updated.enabledClients);
      setClient(updated.defaultClient);
      progDialogRef.current?.close();
      showToast(
        "success",
        updated.enabledClients.length === 1
          ? `Deployment locked to single client: ${updated.defaultClient}. Other clients are now hidden.`
          : `Deployment updated (${updated.enabledClients.length} clients enabled).`
      );
    } catch (err) {
      setProgError(String(err));
    }
  };

  // Load client configuration when client changes
  useEffect(() => {
    let active = true;
    async function loadConfig() {
      try {
        const defaultForm =
          CLIENTS.find((c) => c.id === client)?.forms[0] || "Sales Invoice";
        setFormType(defaultForm);
        setEnableExpDate(client !== "MET");
        setHasPreview(false);
        setInvoices([]);
        setTransfers([]);

        const cfg = await getClientConfig(client);
        if (!active) return;

        setSeriesNumber(cfg.seriesNumber);
        setSeriesInputText(formatSeriesNumber(cfg.seriesNumber));
        setAcNo(cfg.acNo || "");
        setDateIssued(toInputDateValue(cfg.dateIssued));
        setSignatory(cfg.signatory);
        setDbStatus(cfg.dbStatus);

        if (client === "NHC") {
          setDrAddress(cfg.drDefaults.address || "");
          setDrTerms(cfg.drDefaults.terms || "");
          setDrStoreCode(cfg.drDefaults.storeCode || "");
          setDrPoNumber(cfg.drDefaults.poNumber || "");
          setDrTin(cfg.drDefaults.tin || "");
        }
      } catch (err) {
        if (!active) return;
        setStatusBanner({
          type: "error",
          text: `Failed to load client configuration: ${String(err)}`,
        });
      }
    }
    loadConfig();
    return () => {
      active = false;
    };
  }, [client]);

  // Load saved layout offsets whenever client or formType changes
  useEffect(() => {
    let active = true;
    const layoutKey = `${client}_${formType}`;
    getLayoutOffsets(layoutKey).then((saved) => {
      if (active) {
        setLayoutOffsets(saved || {});
        setSelectedField("__page__");
      }
    });
    return () => {
      active = false;
    };
  }, [client, formType]);

  const handleUpdateOffset = (
    fieldKey: string,
    dx: number,
    dy: number,
    announcement?: string
  ) => {
    setLayoutOffsets((prev) => ({
      ...prev,
      [fieldKey]: { dx, dy },
    }));
    if (announcement) {
      setDragAnnouncement(announcement);
    }
  };

  const handleNudgeSelected = (deltaX: number, deltaY: number, dirLabel: string) => {
    const target = selectedField || "__page__";
    const current = layoutOffsets[target] || { dx: 0, dy: 0 };
    const nextDx = current.dx + deltaX;
    const nextDy = current.dy + deltaY;
    handleUpdateOffset(
      target,
      nextDx,
      nextDy,
      `${target === "__page__" ? "Entire page" : target} moved ${dirLabel}`
    );
  };

  const handleSaveLayoutPositions = async () => {
    const layoutKey = `${client}_${formType}`;
    try {
      await saveLayoutOffsets(layoutKey, layoutOffsets);
      showToast(
        "success",
        `Saved custom print positions for ${client} (${formType}).`
      );
    } catch (err) {
      showToast("error", `Failed to save layout positions: ${String(err)}`);
    }
  };

  const handleResetLayoutPositions = async () => {
    const layoutKey = `${client}_${formType}`;
    setLayoutOffsets({});
    try {
      await saveLayoutOffsets(layoutKey, {});
      setDragAnnouncement("All field positions reset to default");
      showToast(
        "info",
        `Reset print positions to default for ${client} (${formType}).`
      );
    } catch (err) {
      showToast("error", `Failed to reset layout positions: ${String(err)}`);
    }
  };

  const showToast = (type: "info" | "success" | "error", text: string) => {
    setStatusBanner({ type, text });
  };

  // Series Number Handlers
  const handleSeriesIncrement = async (delta: number) => {
    const next = Math.max(0, seriesNumber + delta);
    setSeriesNumber(next);
    setSeriesInputText(formatSeriesNumber(next));
    try {
      await updateSeriesNumber(client, next);
    } catch (err) {
      showToast("error", `Error updating series number: ${String(err)}`);
    }
  };

  const handleSeriesBlur = async () => {
    const parsed = parseInt(seriesInputText.replace(/\D/g, ""), 10);
    const next = isNaN(parsed) ? seriesNumber : Math.max(0, parsed);
    setSeriesNumber(next);
    setSeriesInputText(formatSeriesNumber(next));
    try {
      await updateSeriesNumber(client, next);
    } catch (err) {
      showToast("error", `Error saving series number: ${String(err)}`);
    }
  };

  // Save BIR Permit No / AC No & Date Issued
  const handleSavePermitDetails = async () => {
    try {
      const [yyyy, mm, dd] = dateIssued.split("-");
      const formatted =
        yyyy && mm && dd ? `${mm}/${dd}/${yyyy}` : dateIssued;
      await updateAcNoAndDate(client, acNo, formatted);
      showToast("success", `Saved BIR Permit No. & Date Issued for ${client}.`);
    } catch (err) {
      showToast("error", `Failed to save record: ${String(err)}`);
    }
  };

  // Save Signatory
  const handleSaveSignatory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSignatory(client, signatory);
      showToast("success", `Signatory saved to database for ${client}.`);
    } catch (err) {
      showToast("error", `Error saving signatory: ${String(err)}`);
    }
  };

  // Save NHC Delivery Receipt History Details
  const handleSaveDrHistoryDetails = async () => {
    if (!refNumber.trim()) {
      setRefError("Please enter a Reference Number before saving.");
      refInputRef.current?.focus();
      return;
    }
    try {
      await saveHistoryDr({
        refNumber: refNumber.trim(),
        address: drAddress,
        terms: drTerms,
        storeCode: drStoreCode,
        poNumber: drPoNumber,
        tin: drTin,
        businessStyle,
        note,
        customerName: drCustomerName,
      });
      showToast(
        "success",
        `Delivery Receipt details saved to HistoryDRDetails for Ref #${refNumber.trim()}.`
      );
    } catch (err) {
      showToast("error", `Failed to save DR details: ${String(err)}`);
    }
  };

  // Populate editable lines grid from transfer data
  const buildEditableLines = (trList: TransferInventoryData[]) => {
    const rows: EditableDRLine[] = [];
    let totalAmount = 0;
    for (const tr of trList) {
      for (let i = 0; i < (tr.lines || []).length; i++) {
        const line = tr.lines[i];
        const lineAmt =
          line.amount > 0
            ? line.amount
            : (line.averageCost || line.salesPrice || 0) * (line.quantityTransfer || 1);
        totalAmount += lineAmt;
        rows.push({
          id: `line-${i}`,
          description: line.itemDescription || "N/A",
          price: lineAmt.toFixed(2),
          expirationDate: line.expirationDate || "",
        });
      }
    }
    rows.push({
      id: "line-total",
      description: "TOTAL",
      price: totalAmount.toFixed(2),
      expirationDate: "",
      isTotal: true,
    });
    setEditableLines(rows);
  };

  // Search Reference Number directly in live QuickBooks via QBSDK
  const handleSearch = async () => {
    const targetRef = refNumber.trim();
    if (!targetRef) {
      setRefError("Please enter a reference number.");
      refInputRef.current?.focus();
      return;
    }
    setRefError("");
    setIsBusy(true);

    try {
      const result = await searchDocument(client, formType, targetRef);
      if (!result.found) {
        setHasPreview(false);
        setInvoices([]);
        setTransfers([]);
        showToast("error", result.message);
        return;
      }

      setInvoices(result.invoices);
      setTransfers(result.transfers);
      setDataSourceLabel(result.source);

      // Load saved HistoryDRDetails if NHC Delivery Receipt
      if (client === "NHC" && formType === "Delivery Receipt") {
        if (result.historyDr) {
          setDrAddress(result.historyDr.address || "");
          setDrStoreCode(result.historyDr.storeCode || "");
          setDrPoNumber(result.historyDr.poNumber || "");
          setDrTin(result.historyDr.tin || "");
          setBusinessStyle(result.historyDr.businessStyle || "");
          setNote(result.historyDr.note || "");
          setDrTerms(result.historyDr.terms || "");
          setDrCustomerName(result.historyDr.customerName || "");
        }
        buildEditableLines(result.transfers);

        if (enableExpDate) {
          drEditDialogRef.current?.showModal();
        }
      } else {
        setShowDrEditor(false);
      }

      setHasPreview(true);
      showToast("success", result.message);
    } catch (err) {
      setHasPreview(false);
      setInvoices([]);
      setTransfers([]);
      showToast("error", String(err));
    } finally {
      setIsBusy(false);
    }
  };

  // Print Document & Auto-increment Series Number (Enclosure, FP, PBS, IVP)
  const handlePrintDocument = async () => {
    window.print();
    if (
      client === "Enclosure" ||
      client === "FP" ||
      client === "PBS" ||
      client === "IVP"
    ) {
      const next = seriesNumber + 1;
      setSeriesNumber(next);
      setSeriesInputText(formatSeriesNumber(next));
      try {
        await updateSeriesNumber(client, next);
        showToast(
          "info",
          `Print dialog completed. Series Number incremented to ${formatSeriesNumber(next)}.`
        );
      } catch (err) {
        showToast("error", `Failed to update series number after print: ${String(err)}`);
      }
    }
  };

  // Handle NHC Delivery Receipt Edit Options Dialog Close
  const handleDrEditDialogClose = () => {
    const dialog = drEditDialogRef.current;
    if (!dialog) return;
    const choice = dialog.returnValue;
    dialog.returnValue = "";

    if (choice === "both") {
      setAllowPriceEditing(true);
      setShowDrEditor(true);
      showToast("info", "Edit mode active: You can edit both Price and Expiration Date.");
    } else if (choice === "exp_only") {
      setAllowPriceEditing(false);
      setShowDrEditor(true);
      showToast(
        "info",
        "Edit mode active: You can edit Expiration Date only (Price column locked)."
      );
    } else {
      setShowDrEditor(false);
    }
  };

  // IVP Permission Reset
  const handlePermissionReset = async () => {
    setIsBusy(true);
    try {
      const msg = await resetQbPermission();
      showToast("info", msg);
    } catch (err) {
      showToast("error", String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const supportsSeriesNumber =
    client === "Enclosure" || client === "FP" || client === "PBS";
  const supportsPermitFields =
    client === "Enclosure" || client === "FP" || client === "PBS";
  const isDeliveryReceipt = formType === "Delivery Receipt";
  const isPreprintedClient =
    client === "NHC" ||
    client === "MET" ||
    client === "IVP" ||
    client === "MEDILIGHT";

  return (
    <div className="qbsi-app">
      {/* TOP BAR (TitlePanel) */}
      <header className="qbsi-topbar no-print">
        <div className="topbar-left">
          <div
            className="brand-badge"
            onClick={handleBrandBadgeSecretClick}
            style={{ userSelect: "none", cursor: "default" }}
          >
            <Building2 size={20} />
            <div>
              <span className="brand-title">Q B S I</span>
              <span className="brand-client">{currentClientMeta.subtitle}</span>
            </div>
          </div>

          {/* Client Switcher — automatically hidden when locked to a single client */}
          {visibleClients.length > 1 && (
            <div className="client-switcher">
              <label htmlFor={`${baseId}-client-select`} className="topbar-label">
                Client:
              </label>
              <select
                id={`${baseId}-client-select`}
                name="client"
                className="topbar-select"
                value={client}
                onChange={(e) => setClient(e.target.value as ClientId)}
              >
                {visibleClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} — {c.subtitle}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Permission Reset for IVP */}
          {client === "IVP" && (
            <button
              type="button"
              className="btn-topbar"
              onClick={handlePermissionReset}
              disabled={isBusy}
            >
              <ShieldAlert size={15} />
              Permission Reset
            </button>
          )}
        </div>

        <div className="topbar-right">
          <div className="db-pill" title={dbStatus.accdbPath}>
            <Database size={14} />
            <span>
              {dbStatus.qbfcAvailable
                ? "QuickBooks Live (QBSDK)"
                : "QBSDK Bridge Offline"}
            </span>
          </div>
        </div>
      </header>

      {/* STATUS BANNER */}
      {statusBanner && (
        <div
          role="status"
          aria-live="polite"
          className={`status-banner status-${statusBanner.type} no-print`}
        >
          <div className="status-banner-content">
            <CheckCircle2 size={16} />
            <span>{statusBanner.text}</span>
          </div>
          <button
            type="button"
            className="status-close"
            onClick={() => setStatusBanner(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* MAIN WORKSPACE */}
      <div className="qbsi-workspace">
        {/* LEFT SIDEBAR (SidebarPanel) */}
        <aside className="qbsi-sidebar no-print">
          {/* 1. SELECT FORM */}
          <section className="sidebar-card">
            <div className="field-group">
              <label htmlFor={`${baseId}-form-select`} className="field-label">
                SELECT FORM:
              </label>
              <select
                id={`${baseId}-form-select`}
                name="formType"
                className="form-control"
                value={formType}
                onChange={(e) => setFormType(e.target.value as FormType)}
              >
                {currentClientMeta.forms.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* 2. SERIES NUMBER (Enclosure, FP, PBS) */}
          {supportsSeriesNumber && (
            <section className="sidebar-card">
              <div className="field-group">
                <label htmlFor={`${baseId}-series-input`} className="field-label">
                  Current Series Number:
                </label>
                <div className="series-row">
                  <input
                    id={`${baseId}-series-input`}
                    name="seriesNumber"
                    type="text"
                    inputMode="numeric"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="form-control series-input"
                    value={seriesInputText}
                    onChange={(e) => setSeriesInputText(e.target.value)}
                    onBlur={handleSeriesBlur}
                  />
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label="Decrement series number"
                    onClick={() => handleSeriesIncrement(-1)}
                  >
                    <Minus size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label="Increment series number"
                    onClick={() => handleSeriesIncrement(1)}
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* 3. ENTER REFERENCE NUMBER */}
          <section className="sidebar-card">
            <search>
              <form
                aria-labelledby={`${baseId}-ref-heading`}
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSearch();
                }}
              >
                <div className="field-group">
                  <label
                    id={`${baseId}-ref-heading`}
                    htmlFor={`${baseId}-ref-input`}
                    className="field-label"
                  >
                    ENTER REFERENCE NUMBER:
                  </label>
                  <input
                    ref={refInputRef}
                    id={`${baseId}-ref-input`}
                    name="refNumber"
                    type="text"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="search"
                    aria-invalid={refError ? "true" : undefined}
                    aria-describedby={refError ? `${baseId}-ref-error` : undefined}
                    className="form-control"
                    value={refNumber}
                    onChange={(e) => {
                      setRefNumber(e.target.value);
                      if (refError) setRefError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                    }}
                  />
                  {refError && (
                    <span id={`${baseId}-ref-error`} className="field-error">
                      {refError}
                    </span>
                  )}

                  <button
                    type="submit"
                    className="btn-primary full-width"
                    disabled={isBusy}
                  >
                    <Search size={15} />
                    {isBusy ? "QUERYING QUICKBOOKS..." : "SEARCH"}
                  </button>
                </div>
              </form>
            </search>
          </section>

          {/* 4. SIGNATORY PANEL */}
          <section className="sidebar-card">
            <form
              aria-labelledby={`${baseId}-sig-heading`}
              onSubmit={handleSaveSignatory}
            >
              <h2 id={`${baseId}-sig-heading`} className="card-heading">
                SIGNATORY:
              </h2>

              {client === "MET" || client === "NHC" || client === "MEDILIGHT" ? (
                <div className="field-group">
                  <label htmlFor={`${baseId}-sig-cashier`} className="field-label">
                    {client === "MEDILIGHT"
                      ? "Cashier / Authorized Rep.:"
                      : "Name:"}
                  </label>
                  <input
                    id={`${baseId}-sig-cashier`}
                    name="cashierName"
                    type="text"
                    className="form-control"
                    value={signatory.cashierName}
                    onChange={(e) =>
                      setSignatory({ ...signatory, cashierName: e.target.value })
                    }
                  />
                </div>
              ) : client === "IVP" ? (
                <div className="field-group">
                  <label htmlFor={`${baseId}-sig-auth`} className="field-label">
                    Authorize Signature:
                  </label>
                  <input
                    id={`${baseId}-sig-auth`}
                    name="preparedBy"
                    type="text"
                    className="form-control"
                    value={signatory.preparedBy}
                    onChange={(e) =>
                      setSignatory({ ...signatory, preparedBy: e.target.value })
                    }
                  />
                </div>
              ) : (
                <>
                  <div className="field-group">
                    <label htmlFor={`${baseId}-sig-prep`} className="field-label">
                      Prepared By:
                    </label>
                    <input
                      id={`${baseId}-sig-prep`}
                      name="preparedBy"
                      type="text"
                      className="form-control"
                      value={signatory.preparedBy}
                      onChange={(e) =>
                        setSignatory({ ...signatory, preparedBy: e.target.value })
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor={`${baseId}-sig-chk`} className="field-label">
                      Approved By:
                    </label>
                    <input
                      id={`${baseId}-sig-chk`}
                      name="checkedBy"
                      type="text"
                      className="form-control"
                      value={signatory.checkedBy}
                      onChange={(e) =>
                        setSignatory({ ...signatory, checkedBy: e.target.value })
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor={`${baseId}-sig-app`} className="field-label">
                      Received By:
                    </label>
                    <input
                      id={`${baseId}-sig-app`}
                      name="approvedBy"
                      type="text"
                      className="form-control"
                      value={signatory.approvedBy}
                      onChange={(e) =>
                        setSignatory({ ...signatory, approvedBy: e.target.value })
                      }
                    />
                  </div>
                </>
              )}

              <button type="submit" className="btn-secondary full-width">
                <Save size={15} />
                SAVE SIGNATORY
              </button>
            </form>
          </section>

          {/* 5. PRINTING CONTROLS */}
          {hasPreview && (
            <section className="sidebar-card">
              <h2 className="card-heading">PRINT &amp; ZOOM:</h2>
              <div className="zoom-row">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
                >
                  <ZoomOut size={15} />
                  Zoom Out
                </button>
                <span className="zoom-pct">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
                >
                  <ZoomIn size={15} />
                  Zoom In
                </button>
              </div>
              <button
                type="button"
                className="btn-primary full-width print-btn"
                onClick={handlePrintDocument}
              >
                <Printer size={16} />
                Print Document
              </button>
            </section>
          )}
        </aside>

        {/* MIDDLE DETAILS PANEL (Main_PanelDetails) */}
        {client !== "IVP" && (
          <section className="qbsi-details-panel no-print">
            <h2 className="panel-section-title">
              <Layers size={16} />
              Document Details &amp; Options
            </h2>

            {/* Reprint Toggle for FP at top of Details */}
            {client === "FP" && (
              <div className="checkbox-row">
                <input
                  id={`${baseId}-fp-reprint`}
                  name="isReprint"
                  type="checkbox"
                  checked={isReprint}
                  onChange={(e) => setIsReprint(e.target.checked)}
                />
                <label htmlFor={`${baseId}-fp-reprint`}>Reprint</label>
              </div>
            )}

            {/* Note */}
            <div className="field-group">
              <label htmlFor={`${baseId}-note`} className="field-label">
                Note:
              </label>
              <textarea
                id={`${baseId}-note`}
                name="note"
                rows={2}
                className="form-control"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {/* Business Style/Name */}
            <div className="field-group">
              <label htmlFor={`${baseId}-bstyle`} className="field-label">
                Business Style/Name:
              </label>
              <input
                id={`${baseId}-bstyle`}
                name="businessStyle"
                type="text"
                className="form-control"
                value={businessStyle}
                onChange={(e) => setBusinessStyle(e.target.value)}
              />
            </div>

            {/* BIR Permit No & Date Issued (Enclosure, FP, PBS) */}
            {supportsPermitFields && (
              <div className="permit-box">
                <div className="two-col-grid">
                  <div className="field-group">
                    <label htmlFor={`${baseId}-acno`} className="field-label">
                      {client === "Enclosure" ? "BIR Permit No:" : "BIR Per No:"}
                    </label>
                    <input
                      id={`${baseId}-acno`}
                      name="acNo"
                      type="text"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="form-control"
                      value={acNo}
                      onChange={(e) => setAcNo(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor={`${baseId}-date-issued`} className="field-label">
                      Date Issued:
                    </label>
                    <input
                      id={`${baseId}-date-issued`}
                      name="dateIssued"
                      type="date"
                      className="form-control"
                      value={dateIssued}
                      onChange={(e) => setDateIssued(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary full-width"
                  onClick={handleSavePermitDetails}
                >
                  <Save size={15} />
                  SAVE PERMIT DETAILS
                </button>

                <div className="checkbox-row">
                  <input
                    id={`${baseId}-inc-date`}
                    name="includeDateIssued"
                    type="checkbox"
                    checked={includeDateIssued}
                    onChange={(e) => setIncludeDateIssued(e.target.checked)}
                  />
                  <label htmlFor={`${baseId}-inc-date`}>Include Date Issued</label>
                </div>
              </div>
            )}

            {/* Delivery Receipt Override Fields (NHC) */}
            {client === "NHC" && isDeliveryReceipt && (
              <div className="dr-override-box">
                <div className="field-group">
                  <label htmlFor={`${baseId}-dr-cname`} className="field-label">
                    Customer Name:
                  </label>
                  <input
                    id={`${baseId}-dr-cname`}
                    name="drCustomerName"
                    type="text"
                    className="form-control"
                    value={drCustomerName}
                    onChange={(e) => setDrCustomerName(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor={`${baseId}-dr-addr`} className="field-label">
                    Address:
                  </label>
                  <textarea
                    id={`${baseId}-dr-addr`}
                    name="drAddress"
                    rows={2}
                    autoComplete="street-address"
                    className="form-control"
                    value={drAddress}
                    onChange={(e) => setDrAddress(e.target.value)}
                  />
                </div>
                <div className="two-col-grid">
                  <div className="field-group">
                    <label htmlFor={`${baseId}-dr-terms`} className="field-label">
                      Terms:
                    </label>
                    <input
                      id={`${baseId}-dr-terms`}
                      name="drTerms"
                      type="text"
                      className="form-control"
                      value={drTerms}
                      onChange={(e) => setDrTerms(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor={`${baseId}-dr-sc`} className="field-label">
                      Store Code:
                    </label>
                    <input
                      id={`${baseId}-dr-sc`}
                      name="drStoreCode"
                      type="text"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="form-control"
                      value={drStoreCode}
                      onChange={(e) => setDrStoreCode(e.target.value)}
                    />
                  </div>
                </div>
                <div className="two-col-grid">
                  <div className="field-group">
                    <label htmlFor={`${baseId}-dr-po`} className="field-label">
                      PO#:
                    </label>
                    <input
                      id={`${baseId}-dr-po`}
                      name="drPoNumber"
                      type="text"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="form-control"
                      value={drPoNumber}
                      onChange={(e) => setDrPoNumber(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor={`${baseId}-dr-tin`} className="field-label">
                      TIN:
                    </label>
                    <input
                      id={`${baseId}-dr-tin`}
                      name="drTin"
                      type="text"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="form-control"
                      value={drTin}
                      onChange={(e) => setDrTin(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary full-width"
                  onClick={handleSaveDrHistoryDetails}
                >
                  <Save size={15} />
                  SAVE DETAILS
                </button>
              </div>
            )}

            {/* Enable Amount | Item Code | Exp. Date (NHC, MET, MEDILIGHT) */}
            {(client === "NHC" || client === "MET" || client === "MEDILIGHT") && (
              <div className="checkbox-row">
                <input
                  id={`${baseId}-exp-date`}
                  name="enableExpDate"
                  type="checkbox"
                  checked={enableExpDate}
                  onChange={(e) => setEnableExpDate(e.target.checked)}
                />
                <label htmlFor={`${baseId}-exp-date`}>
                  Enable Amount | Item Code | Exp. Date
                </label>
              </div>
            )}

            {/* Editable DataGridView Equivalent for NHC Delivery Receipt */}
            {client === "NHC" && isDeliveryReceipt && editableLines.length > 0 && (
              <div className="dr-table-card">
                <div className="dr-table-header-bar">
                  <span className="field-label">Editable Line Items</span>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => setShowDrEditor((s) => !s)}
                  >
                    {showDrEditor ? "Hide Table" : "Edit Price / Exp. Date"}
                  </button>
                </div>

                {showDrEditor && (
                  <>
                    <div
                      tabIndex={0}
                      role="region"
                      aria-labelledby={`${baseId}-dr-lines-table-caption`}
                      className="table-wrapper"
                    >
                      <table className="dr-editable-table">
                        <caption
                          id={`${baseId}-dr-lines-table-caption`}
                          className="visually-hidden"
                        >
                          Delivery Receipt Editable Line Items
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Description</th>
                            {allowPriceEditing && <th scope="col">Price</th>}
                            <th scope="col">Exp. Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editableLines.map((row, idx) => (
                            <tr
                              key={row.id}
                              className={row.isTotal ? "total-row" : ""}
                            >
                              <th scope="row">{row.description}</th>
                              {allowPriceEditing && (
                                <td>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    aria-label={`Price for ${row.description}`}
                                    className="table-input"
                                    value={row.price}
                                    onChange={(e) => {
                                      const next = [...editableLines];
                                      next[idx] = {
                                        ...next[idx],
                                        price: e.target.value,
                                      };
                                      setEditableLines(next);
                                    }}
                                  />
                                </td>
                              )}
                              <td>
                                {!row.isTotal && (
                                  <input
                                    type="text"
                                    aria-label={`Expiration date for ${row.description}`}
                                    className="table-input"
                                    value={row.expirationDate}
                                    onChange={(e) => {
                                      const next = [...editableLines];
                                      next[idx] = {
                                        ...next[idx],
                                        expirationDate: e.target.value,
                                      };
                                      setEditableLines(next);
                                    }}
                                  />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      type="button"
                      className="btn-primary full-width"
                      onClick={() =>
                        showToast(
                          "success",
                          "Document regenerated with your latest edits."
                        )
                      }
                    >
                      <RotateCcw size={15} />
                      RE-GENERATE DOCUMENT
                    </button>
                  </>
                )}
              </div>
            )}

            {/* EWT & Tax Controls (Sales Invoice) */}
            {!isDeliveryReceipt && (
              <>
                <fieldset className="control-fieldset">
                  <legend className="field-label">Withholding Tax (EWT):</legend>
                  <div className="checkbox-row">
                    <input
                      id={`${baseId}-ewt1`}
                      name="lessEwt1"
                      type="checkbox"
                      checked={lessEwt1}
                      onChange={(e) => {
                        setLessEwt1(e.target.checked);
                        if (e.target.checked) setLessEwt2(false);
                      }}
                    />
                    <label htmlFor={`${baseId}-ewt1`}>Less EWT (1%) ?</label>
                  </div>

                  {(client === "Enclosure" || client === "MEDILIGHT") && (
                    <>
                      <div className="checkbox-row">
                        <input
                          id={`${baseId}-ewt2`}
                          name="lessEwt2"
                          type="checkbox"
                          checked={lessEwt2}
                          onChange={(e) => {
                            setLessEwt2(e.target.checked);
                            if (e.target.checked) setLessEwt1(false);
                          }}
                        />
                        <label htmlFor={`${baseId}-ewt2`}>Less EWT (2%) ?</label>
                      </div>

                      <div className="field-group" style={{ marginTop: 6 }}>
                        <label
                          htmlFor={`${baseId}-manual-ewt`}
                          className="field-label"
                        >
                          Manual EWT Amount:
                        </label>
                        <input
                          id={`${baseId}-manual-ewt`}
                          name="manualEwtAmount"
                          type="text"
                          inputMode="decimal"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          className="form-control"
                          value={manualEwtAmount}
                          onChange={(e) => setManualEwtAmount(e.target.value)}
                        />
                      </div>

                      {client === "Enclosure" && (
                        <div className="checkbox-row" style={{ marginTop: 6 }}>
                          <input
                            id={`${baseId}-enc-reprint`}
                            name="isReprint"
                            type="checkbox"
                            checked={isReprint}
                            onChange={(e) => setIsReprint(e.target.checked)}
                          />
                          <label htmlFor={`${baseId}-enc-reprint`}>
                            Reprint Invoice
                          </label>
                        </div>
                      )}
                    </>
                  )}
                </fieldset>

                <fieldset className="control-fieldset">
                  <legend className="field-label">VAT Mode:</legend>
                  <div className="radio-group">
                    <div className="radio-item">
                      <input
                        id={`${baseId}-vat-inc`}
                        type="radio"
                        name="vatType"
                        value="Inclusive"
                        checked={vatType === "Inclusive"}
                        onChange={() => setVatType("Inclusive")}
                      />
                      <label htmlFor={`${baseId}-vat-inc`}>VAT Inclusive</label>
                    </div>
                    <div className="radio-item">
                      <input
                        id={`${baseId}-vat-exc`}
                        type="radio"
                        name="vatType"
                        value="Exclusive"
                        checked={vatType === "Exclusive"}
                        onChange={() => setVatType("Exclusive")}
                      />
                      <label htmlFor={`${baseId}-vat-exc`}>VAT Exclusive</label>
                    </div>
                  </div>
                </fieldset>
              </>
            )}
          </section>
        )}

        {/* RIGHT PRINT PREVIEW STAGE */}
        <main className="qbsi-preview-stage">
          <div className="preview-toolbar no-print">
            <div className="preview-toolbar-left">
              <FileText size={16} />
              <span className="preview-doc-title">
                {client} — {formType} Preview
                {invoices[0]
                  ? ` (Ref #${invoices[0].refNumber})`
                  : transfers[0]
                  ? ` (Ref #${transfers[0].refNumber})`
                  : ""}
              </span>
              {dataSourceLabel && (
                <span className="source-badge">{dataSourceLabel}</span>
              )}
            </div>

            <div className="preview-toolbar-right">
              {isPreprintedClient && (
                <>
                  <button
                    type="button"
                    className={`btn-adjust-toggle ${adjustMode ? "active" : ""}`}
                    onClick={() => setAdjustMode((m) => !m)}
                  >
                    <Move size={14} />
                    {adjustMode ? "Done Adjusting" : "Adjust Positions"}
                  </button>

                  <div className="checkbox-row inline-toggle">
                    <input
                      id={`${baseId}-guide-toggle`}
                      type="checkbox"
                      checked={showPreprintedGuide}
                      onChange={(e) => setShowPreprintedGuide(e.target.checked)}
                    />
                    <label htmlFor={`${baseId}-guide-toggle`}>
                      <Eye size={14} style={{ marginRight: 4, verticalAlign: "middle" }} />
                      Show Form Template Overlay (Preview Only)
                    </label>
                  </div>
                </>
              )}

              {client === "IVP" && (
                <div className="checkbox-row inline-toggle">
                  <input
                    id={`${baseId}-ivp-rotate`}
                    type="checkbox"
                    checked={ivpRotatePrint}
                    onChange={(e) => setIvpRotatePrint(e.target.checked)}
                  />
                  <label htmlFor={`${baseId}-ivp-rotate`}>
                    Rotate -90° for Receipt Printer
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Interactive Pre-Printed Position Calibration Bar */}
          {isPreprintedClient && adjustMode && (
            <div className="adjust-calibration-bar no-print">
              <div className="adjust-bar-left">
                <span className="adjust-badge">Move Mode</span>
                <label htmlFor={`${baseId}-adjust-target`} className="field-label">
                  Target:
                </label>
                <select
                  id={`${baseId}-adjust-target`}
                  className="adjust-select"
                  value={selectedField}
                  onChange={(e) => setSelectedField(e.target.value)}
                >
                  <option value="__page__">Entire Page (Global Offset)</option>
                  {selectedField !== "__page__" && (
                    <option value={selectedField}>
                      Selected Field: {selectedField}
                    </option>
                  )}
                </select>

                <div className="nudge-controls" role="group" aria-label="Nudge position">
                  <button
                    type="button"
                    className="btn-nudge"
                    aria-label="Move left 1 pixel"
                    onClick={() => handleNudgeSelected(-1, 0, "left")}
                  >
                    <ArrowLeft size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn-nudge"
                    aria-label="Move up 1 pixel"
                    onClick={() => handleNudgeSelected(0, -1, "up")}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn-nudge"
                    aria-label="Move down 1 pixel"
                    onClick={() => handleNudgeSelected(0, 1, "down")}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn-nudge"
                    aria-label="Move right 1 pixel"
                    onClick={() => handleNudgeSelected(1, 0, "right")}
                  >
                    <ArrowRight size={14} />
                  </button>
                </div>

                <span className="adjust-coords">
                  Offset:{" "}
                  <strong>
                    X:{" "}
                    {(layoutOffsets[selectedField] || { dx: 0, dy: 0 }).dx}px, Y:{" "}
                    {(layoutOffsets[selectedField] || { dx: 0, dy: 0 }).dy}px
                  </strong>{" "}
                  (Drag blue handles on form or use Arrow keys / Shift+Arrows)
                </span>
              </div>

              <div className="adjust-bar-right">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={handleResetLayoutPositions}
                >
                  <RotateCcw size={13} />
                  Reset Default
                </button>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={handleSaveLayoutPositions}
                >
                  <Save size={13} />
                  Save Positions
                </button>
              </div>
            </div>
          )}

          {/* Live region for screen reader drag announcements */}
          <div className="visually-hidden" aria-live="polite">
            {dragAnnouncement}
          </div>

          <div className="preview-canvas-Viewport">
            {hasPreview ? (
              <InvoiceCanvasPreview
                client={client}
                formType={formType}
                invoices={invoices}
                transfers={transfers}
                vatType={vatType}
                note={note}
                businessStyle={businessStyle}
                pwdSignature={pwdSignature}
                acNo={acNo}
                dateIssued={dateIssued}
                includeDateIssued={includeDateIssued}
                enableExpDate={enableExpDate}
                lessEwt1={lessEwt1}
                lessEwt2={lessEwt2}
                manualEwtAmount={manualEwtAmount}
                isReprint={isReprint}
                seriesNumberText={seriesInputText}
                signatory={signatory}
                drCustomerName={drCustomerName}
                drAddress={drAddress}
                drTerms={drTerms}
                drStoreCode={drStoreCode}
                drPoNumber={drPoNumber}
                drTin={drTin}
                allowPriceEditing={allowPriceEditing}
                editableLines={editableLines}
                showPreprintedGuide={showPreprintedGuide}
                ivpRotatePrint={ivpRotatePrint}
                zoom={zoom}
                adjustMode={adjustMode}
                selectedField={selectedField}
                onSelectField={setSelectedField}
                layoutOffsets={layoutOffsets}
                onUpdateOffset={handleUpdateOffset}
              />
            ) : (
              <div className="empty-preview no-print">
                <Sparkles size={36} />
                <h3>Ready to Query QuickBooks</h3>
                <p>
                  Enter a Reference Number on the left and click{" "}
                  <strong>SEARCH</strong> to query live data directly from
                  QuickBooks Desktop via QBSDK.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* NATIVE MODAL DIALOG 1: NHC Delivery Receipt Edit Options */}
      <dialog
        ref={drEditDialogRef}
        aria-labelledby={`${baseId}-dr-edit-dialog-title`}
        onClose={handleDrEditDialogClose}
      >
        <h2 id={`${baseId}-dr-edit-dialog-title`} className="dialog-title">
          Edit Options
        </h2>
        <p className="dialog-body">
          How would you like to proceed with this Delivery Receipt?
        </p>
        <form method="dialog" className="dialog-actions-stack">
          <button value="both" className="btn-primary full-width">
            Yes — Edit BOTH Price and Expiration Date
          </button>
          <button value="exp_only" className="btn-secondary full-width">
            No — Edit ONLY Expiration Date (Price remains hidden)
          </button>
          <button value="cancel" autoFocus className="btn-secondary full-width">
            Cancel — Proceed to print preview without editing
          </button>
        </form>
      </dialog>

      {/* NATIVE MODAL DIALOG 2: Hidden Programmer Deployment Configuration */}
      <dialog
        ref={progDialogRef}
        aria-labelledby={`${baseId}-prog-dialog-title`}
        className="prog-dialog"
      >
        <h2 id={`${baseId}-prog-dialog-title`} className="dialog-title">
          <Lock size={18} style={{ verticalAlign: "text-bottom", marginRight: 6 }} />
          Programmer Client Deployment Access
        </h2>

        {!progUnlocked ? (
          <form onSubmit={handleUnlockProgrammer} className="prog-form">
            <p className="dialog-body">
              Enter the Programmer Passcode to configure which clients are
              enabled on this installation.
            </p>
            <div className="field-group">
              <label htmlFor={`${baseId}-prog-pass`} className="field-label">
                Programmer Passcode:
              </label>
              <input
                id={`${baseId}-prog-pass`}
                name="passcode"
                type="password"
                autoComplete="current-password"
                className="form-control"
                value={progPasscode}
                onChange={(e) => setProgPasscode(e.target.value)}
                required
              />
            </div>
            {progError && <div className="field-error">{progError}</div>}
            <div className="dialog-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => progDialogRef.current?.close()}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                <KeyRound size={15} />
                Unlock
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSaveProgrammerConfig} className="prog-form">
            <p className="dialog-body">
              Uncheck clients to hide them, or click{" "}
              <strong>Lock Only This Client</strong> to hide the client dropdown
              and restrict this installation to a single company.
            </p>

            <div className="prog-client-list">
              {CLIENTS.map((c) => {
                const isChecked = draftEnabledClients.includes(c.id);
                const isSole =
                  draftEnabledClients.length === 1 &&
                  draftEnabledClients[0] === c.id;
                return (
                  <div
                    key={c.id}
                    className={`prog-client-row ${isChecked ? "active" : ""}`}
                  >
                    <div className="checkbox-row">
                      <input
                        id={`${baseId}-prog-chk-${c.id}`}
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleDraftClient(c.id)}
                      />
                      <label htmlFor={`${baseId}-prog-chk-${c.id}`}>
                        <strong>{c.label}</strong> — {c.subtitle}
                      </label>
                    </div>
                    <button
                      type="button"
                      className={`btn-isolate ${isSole ? "sole" : ""}`}
                      onClick={() => handleIsolateSingleClient(c.id)}
                    >
                      {isSole ? "Locked Only" : "Lock Only This Client"}
                    </button>
                  </div>
                );
              })}
            </div>

            {draftEnabledClients.length > 1 && (
              <div className="field-group">
                <label
                  htmlFor={`${baseId}-prog-default-client`}
                  className="field-label"
                >
                  Default Startup Client:
                </label>
                <select
                  id={`${baseId}-prog-default-client`}
                  className="form-control"
                  value={draftDefaultClient}
                  onChange={(e) =>
                    setDraftDefaultClient(e.target.value as ClientId)
                  }
                >
                  {CLIENTS.filter((c) =>
                    draftEnabledClients.includes(c.id)
                  ).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} — {c.subtitle}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="field-group">
              <label htmlFor={`${baseId}-prog-new-pass`} className="field-label">
                Change Programmer Passcode (optional):
              </label>
              <input
                id={`${baseId}-prog-new-pass`}
                name="newPasscode"
                type="password"
                autoComplete="new-password"
                className="form-control"
                value={progNewPasscode}
                onChange={(e) => setProgNewPasscode(e.target.value)}
              />
            </div>

            {progError && <div className="field-error">{progError}</div>}

            <div className="dialog-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  setDraftEnabledClients(CLIENTS.map((c) => c.id))
                }
              >
                Enable All {CLIENTS.length} Clients
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => progDialogRef.current?.close()}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                <Save size={15} />
                Save Deployment
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}

export default App;
