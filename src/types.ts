export type ClientId =
  | "Enclosure"
  | "FP"
  | "PBS"
  | "NHC"
  | "MET"
  | "IVP"
  | "MEDILIGHT";

export type FormType = "Sales Invoice" | "Delivery Receipt" | "Collection Receipt";

export interface InvoiceLineItem {
  quantity: number;
  description: string;
  salesrep: string;
  itemName: string;
  tax: string;
  unitOfMeasure: string;
  expirationDate: string;
  skuCode: string;
  taxesName: string;
  rate: number;
  amount: number;
  totalAmount: number;
  salesTaxTotal: number;
  serviceDate: string;
}

export interface InvoiceData {
  refNumber: string;
  tinNo: string;
  customerName: string;
  poNumber: string;
  drNo: string;
  pwdNo: string;
  soNumber: string;
  businessStyle: string;
  storeCode: string;
  jobOrderNo: string;
  attention: string;
  billAddress1: string;
  billAddress2: string;
  billAddress3: string;
  billAddress4: string;
  billAddress5: string;
  shipAddress1: string;
  shipAddress2: string;
  shipAddress3: string;
  shipAddress4: string;
  shipAddress5: string;
  txnDate: string;
  dueDate: string;
  terms: string;
  salesrep: string;
  taxesName: string;
  subtotal: number;
  salesTaxTotal: number;
  totalAmount: number;
  balanceRemaining: number;
  lineItems: InvoiceLineItem[];
  customFields: Record<string, string>;
}

export interface TransferInventoryLineData {
  itemRefListId: string;
  quantityTransfer: number;
  salesPrice: number;
  itemDescription: string;
  baseUnitName: string;
  averageCost: number;
  amount: number;
  siteListId: string;
  siteName: string;
  siteDescription: string;
  siteAddr1: string;
  siteAddr2: string;
  siteAddr3: string;
  siteAddr4: string;
  siteAddr5: string;
  expirationDate: string;
}

export interface TransferInventoryData {
  txnId: string;
  refNumber: string;
  txnDate: string;
  lines: TransferInventoryLineData[];
}

export interface SignatoryData {
  preparedBy: string;
  checkedBy: string;
  approvedBy: string;
  cashierName: string;
}

export interface HistoryDRDetails {
  refNumber: string;
  address: string;
  terms: string;
  storeCode: string;
  poNumber: string;
  tin: string;
  businessStyle: string;
  note: string;
  customerName: string;
}

export interface DbStatus {
  accdbConnected: boolean;
  accdbPath: string;
  sqlitePath: string;
  qbfcAvailable: boolean;
}

export interface ClientConfigResponse {
  client: ClientId;
  seriesNumber: number;
  acNo: string;
  dateIssued: string;
  signatory: SignatoryData;
  drDefaults: HistoryDRDetails;
  dbStatus: DbStatus;
}

export interface DocumentSearchResult {
  found: boolean;
  source: string;
  invoices: InvoiceData[];
  transfers: TransferInventoryData[];
  historyDr: HistoryDRDetails | null;
  message: string;
}

export interface EditableDRLine {
  id: string;
  description: string;
  price: string;
  expirationDate: string;
  isTotal?: boolean;
}

export interface AppDeploymentConfig {
  enabledClients: ClientId[];
  defaultClient: ClientId;
}

export interface FieldOffset {
  dx: number;
  dy: number;
}

export type LayoutOffsetsMap = Record<string, FieldOffset>;


