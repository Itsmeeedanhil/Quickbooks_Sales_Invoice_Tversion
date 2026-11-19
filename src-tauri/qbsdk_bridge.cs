using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;
using QBFC16Lib;

namespace QbsiBridge
{
    public class InvoiceLineItemDto
    {
        public double quantity { get; set; }
        public string description { get; set; }
        public string salesrep { get; set; }
        public string itemName { get; set; }
        public string tax { get; set; }
        public string unitOfMeasure { get; set; }
        public string expirationDate { get; set; }
        public string skuCode { get; set; }
        public string taxesName { get; set; }
        public double rate { get; set; }
        public double amount { get; set; }
        public double totalAmount { get; set; }
        public double salesTaxTotal { get; set; }
        public string serviceDate { get; set; }
    }

    public class InvoiceDataDto
    {
        public string refNumber { get; set; }
        public string tinNo { get; set; }
        public string customerName { get; set; }
        public string poNumber { get; set; }
        public string drNo { get; set; }
        public string pwdNo { get; set; }
        public string soNumber { get; set; }
        public string businessStyle { get; set; }
        public string storeCode { get; set; }
        public string jobOrderNo { get; set; }
        public string attention { get; set; }
        public string billAddress1 { get; set; }
        public string billAddress2 { get; set; }
        public string billAddress3 { get; set; }
        public string billAddress4 { get; set; }
        public string billAddress5 { get; set; }
        public string shipAddress1 { get; set; }
        public string shipAddress2 { get; set; }
        public string shipAddress3 { get; set; }
        public string shipAddress4 { get; set; }
        public string shipAddress5 { get; set; }
        public string txnDate { get; set; }
        public string dueDate { get; set; }
        public string terms { get; set; }
        public string salesrep { get; set; }
        public string taxesName { get; set; }
        public double subtotal { get; set; }
        public double salesTaxTotal { get; set; }
        public double totalAmount { get; set; }
        public double balanceRemaining { get; set; }
        public List<InvoiceLineItemDto> lineItems { get; set; }
        public Dictionary<string, string> customFields { get; set; }
    }

    public class TransferInventoryLineDto
    {
        public string itemRefListId { get; set; }
        public double quantityTransfer { get; set; }
        public double salesPrice { get; set; }
        public string itemDescription { get; set; }
        public string baseUnitName { get; set; }
        public double averageCost { get; set; }
        public double amount { get; set; }
        public string siteListId { get; set; }
        public string siteName { get; set; }
        public string siteDescription { get; set; }
        public string siteAddr1 { get; set; }
        public string siteAddr2 { get; set; }
        public string siteAddr3 { get; set; }
        public string siteAddr4 { get; set; }
        public string siteAddr5 { get; set; }
        public string expirationDate { get; set; }
    }

    public class TransferInventoryDto
    {
        public string txnId { get; set; }
        public string refNumber { get; set; }
        public string txnDate { get; set; }
        public List<TransferInventoryLineDto> lines { get; set; }
    }

    public class BridgeResponse
    {
        public bool ok { get; set; }
        public string error { get; set; }
        public List<InvoiceDataDto> invoices { get; set; }
        public List<TransferInventoryDto> transfers { get; set; }
    }

    internal class ItemMeta
    {
        public string ListID;
        public string UnitOfMeasureListID;
        public double SalesPrice;
        public string SalesDesc;
        public double AverageCost;
    }

    internal class SiteMeta
    {
        public string ListID;
        public string Name;
        public string Description;
        public string Addr1;
        public string Addr2;
        public string Addr3;
        public string Addr4;
        public string Addr5;
    }

    public static class Program
    {
        [STAThread]
        public static int Main(string[] args)
        {
            var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
            var resp = new BridgeResponse
            {
                ok = true,
                error = "",
                invoices = new List<InvoiceDataDto>(),
                transfers = new List<TransferInventoryDto>()
            };

            if (args.Length < 1)
            {
                resp.ok = false;
                resp.error = "Missing action argument.";
                Console.WriteLine(serializer.Serialize(resp));
                return 0;
            }

            string action = args[0];
            string refNumber = args.Length > 1 ? args[1] : "";
            string client = args.Length > 2 ? args[2] : "Enclosure";

            try
            {
                if (action == "reauthorize")
                {
                    string appName = "Quickbooks Collection Receipt " + DateTime.Now.Ticks;
                    QBSessionManager sm = new QBSessionManagerClass();
                    try
                    {
                        sm.OpenConnection2("", appName, ENConnectionType.ctLocalQBD);
                        sm.BeginSession("", ENOpenMode.omSingleUser);
                        sm.EndSession();
                        sm.CloseConnection();
                    }
                    finally
                    {
                        try { sm.EndSession(); } catch { }
                        try { sm.CloseConnection(); } catch { }
                    }
                }
                else if (action == "query_invoice")
                {
                    string appName = client == "IVP" ? "Quickbooks Collection Receipt v3" : "QBSI";
                    resp.invoices = GetInvoicesByRefNumber(refNumber, appName, client == "IVP");
                }
                else if (action == "query_invoice_or_so")
                {
                    resp.invoices = GetInvoicesByRefNumber(refNumber, "QBSI", false);
                    if (resp.invoices.Count == 0)
                    {
                        resp.invoices = GetSalesOrdersByRefNumber(refNumber, "QBSI");
                    }
                }
                else if (action == "query_transfer")
                {
                    resp.transfers = GetTransferInventoryByRefNumber(refNumber);
                }
                else
                {
                    resp.ok = false;
                    resp.error = "Unknown action: " + action;
                }
            }
            catch (Exception ex)
            {
                resp.ok = false;
                resp.error = ex.Message;
            }

            Console.WriteLine(serializer.Serialize(resp));
            return 0;
        }

        private static string LookupCustomField(Dictionary<string, string> dict, params string[] keys)
        {
            if (dict == null) return "";
            foreach (var key in keys)
            {
                foreach (var kv in dict)
                {
                    string normalizedKey = kv.Key.Replace(" ", "").Replace(".", "").Replace("#", "").Replace("_", "");
                    string normalizedTarget = key.Replace(" ", "").Replace(".", "").Replace("#", "").Replace("_", "");
                    if (string.Equals(normalizedKey, normalizedTarget, StringComparison.OrdinalIgnoreCase))
                    {
                        return kv.Value ?? "";
                    }
                }
            }
            return "";
        }

        private static List<InvoiceDataDto> GetInvoicesByRefNumber(string refNumber, string appName, bool useOpenConnection2)
        {
            QBSessionManager sessionManager = new QBSessionManagerClass();
            List<InvoiceDataDto> invoices = new List<InvoiceDataDto>();

            try
            {
                if (useOpenConnection2)
                    sessionManager.OpenConnection2("", appName, ENConnectionType.ctLocalQBD);
                else
                    sessionManager.OpenConnection("", appName);

                sessionManager.BeginSession("", ENOpenMode.omDontCare);

                IMsgSetRequest requestMsgSet = sessionManager.CreateMsgSetRequest("US", 13, 0);
                requestMsgSet.Attributes.OnError = ENRqOnError.roeStop;

                IInvoiceQuery invoiceQuery = requestMsgSet.AppendInvoiceQueryRq();
                invoiceQuery.IncludeLineItems.SetValue(true);
                invoiceQuery.IncludeLinkedTxns.SetValue(true);
                invoiceQuery.OwnerIDList.Add("0");

                invoiceQuery.ORInvoiceQuery.InvoiceFilter.ORRefNumberFilter.RefNumberFilter.MatchCriterion.SetValue(ENMatchCriterion.mcStartsWith);
                invoiceQuery.ORInvoiceQuery.InvoiceFilter.ORRefNumberFilter.RefNumberFilter.RefNumber.SetValue(refNumber);

                IMsgSetResponse responseMsgSet = sessionManager.DoRequests(requestMsgSet);
                IResponse response = responseMsgSet.ResponseList.GetAt(0);
                IInvoiceRetList invoiceList = response.Detail as IInvoiceRetList;

                if (invoiceList != null && invoiceList.Count > 0)
                {
                    for (int i = 0; i < invoiceList.Count; i++)
                    {
                        IInvoiceRet qbInvoice = invoiceList.GetAt(i);
                        string foundRef = qbInvoice.RefNumber != null ? qbInvoice.RefNumber.GetValue() : "";
                        if (!string.Equals(foundRef, refNumber, StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        var customFields = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        string customerListID = qbInvoice.CustomerRef != null && qbInvoice.CustomerRef.ListID != null
                            ? qbInvoice.CustomerRef.ListID.GetValue()
                            : "";

                        if (!string.IsNullOrEmpty(customerListID))
                        {
                            var custFields = GetCustomerCustomFields(sessionManager, customerListID);
                            foreach (var kv in custFields)
                            {
                                customFields[kv.Key] = kv.Value;
                            }
                        }

                        if (qbInvoice.DataExtRetList != null)
                        {
                            for (int k = 0; k < qbInvoice.DataExtRetList.Count; k++)
                            {
                                IDataExtRet dataExt = qbInvoice.DataExtRetList.GetAt(k);
                                string fName = dataExt.DataExtName != null ? dataExt.DataExtName.GetValue() : "";
                                string fVal = dataExt.DataExtValue != null ? dataExt.DataExtValue.GetValue() : "";
                                if (!string.IsNullOrEmpty(fName))
                                {
                                    customFields[fName] = fVal;
                                }
                            }
                        }

                        double subtotal = qbInvoice.Subtotal != null ? qbInvoice.Subtotal.GetValue() : 0.0;
                        double salesTaxTotal = qbInvoice.SalesTaxTotal != null ? qbInvoice.SalesTaxTotal.GetValue() : 0.0;
                        double balanceRemaining = qbInvoice.BalanceRemaining != null ? qbInvoice.BalanceRemaining.GetValue() : 0.0;
                        double totalAmount = subtotal + salesTaxTotal;
                        string taxesName = qbInvoice.ItemSalesTaxRef != null && qbInvoice.ItemSalesTaxRef.FullName != null
                            ? qbInvoice.ItemSalesTaxRef.FullName.GetValue()
                            : "";
                        string salesRep = qbInvoice.SalesRepRef != null && qbInvoice.SalesRepRef.FullName != null
                            ? qbInvoice.SalesRepRef.FullName.GetValue()
                            : "";

                        var dto = new InvoiceDataDto
                        {
                            refNumber = foundRef,
                            customerName = qbInvoice.CustomerRef != null && qbInvoice.CustomerRef.FullName != null ? qbInvoice.CustomerRef.FullName.GetValue() : "",
                            poNumber = qbInvoice.PONumber != null ? qbInvoice.PONumber.GetValue() : "",
                            terms = qbInvoice.TermsRef != null && qbInvoice.TermsRef.FullName != null ? qbInvoice.TermsRef.FullName.GetValue() : "",
                            salesrep = salesRep,
                            taxesName = taxesName,
                            txnDate = qbInvoice.TxnDate != null ? qbInvoice.TxnDate.GetValue().ToString("MM/dd/yyyy") : "",
                            dueDate = qbInvoice.DueDate != null ? qbInvoice.DueDate.GetValue().ToString("MM/dd/yyyy") : "",
                            subtotal = subtotal,
                            salesTaxTotal = salesTaxTotal,
                            totalAmount = totalAmount,
                            balanceRemaining = balanceRemaining > 0 ? balanceRemaining : totalAmount,

                            billAddress1 = qbInvoice.BillAddressBlock != null && qbInvoice.BillAddressBlock.Addr1 != null ? qbInvoice.BillAddressBlock.Addr1.GetValue() : (qbInvoice.BillAddress != null && qbInvoice.BillAddress.Addr1 != null ? qbInvoice.BillAddress.Addr1.GetValue() : ""),
                            billAddress2 = qbInvoice.BillAddressBlock != null && qbInvoice.BillAddressBlock.Addr2 != null ? qbInvoice.BillAddressBlock.Addr2.GetValue() : (qbInvoice.BillAddress != null && qbInvoice.BillAddress.Addr2 != null ? qbInvoice.BillAddress.Addr2.GetValue() : ""),
                            billAddress3 = qbInvoice.BillAddressBlock != null && qbInvoice.BillAddressBlock.Addr3 != null ? qbInvoice.BillAddressBlock.Addr3.GetValue() : (qbInvoice.BillAddress != null && qbInvoice.BillAddress.Addr3 != null ? qbInvoice.BillAddress.Addr3.GetValue() : ""),
                            billAddress4 = qbInvoice.BillAddressBlock != null && qbInvoice.BillAddressBlock.Addr4 != null ? qbInvoice.BillAddressBlock.Addr4.GetValue() : (qbInvoice.BillAddress != null && qbInvoice.BillAddress.Addr4 != null ? qbInvoice.BillAddress.Addr4.GetValue() : ""),
                            billAddress5 = qbInvoice.BillAddressBlock != null && qbInvoice.BillAddressBlock.Addr5 != null ? qbInvoice.BillAddressBlock.Addr5.GetValue() : (qbInvoice.BillAddress != null && qbInvoice.BillAddress.Addr5 != null ? qbInvoice.BillAddress.Addr5.GetValue() : ""),

                            shipAddress1 = qbInvoice.ShipAddressBlock != null && qbInvoice.ShipAddressBlock.Addr1 != null ? qbInvoice.ShipAddressBlock.Addr1.GetValue() : (qbInvoice.ShipAddress != null && qbInvoice.ShipAddress.Addr1 != null ? qbInvoice.ShipAddress.Addr1.GetValue() : ""),
                            shipAddress2 = qbInvoice.ShipAddressBlock != null && qbInvoice.ShipAddressBlock.Addr2 != null ? qbInvoice.ShipAddressBlock.Addr2.GetValue() : (qbInvoice.ShipAddress != null && qbInvoice.ShipAddress.Addr2 != null ? qbInvoice.ShipAddress.Addr2.GetValue() : ""),
                            shipAddress3 = qbInvoice.ShipAddressBlock != null && qbInvoice.ShipAddressBlock.Addr3 != null ? qbInvoice.ShipAddressBlock.Addr3.GetValue() : (qbInvoice.ShipAddress != null && qbInvoice.ShipAddress.Addr3 != null ? qbInvoice.ShipAddress.Addr3.GetValue() : ""),
                            shipAddress4 = qbInvoice.ShipAddressBlock != null && qbInvoice.ShipAddressBlock.Addr4 != null ? qbInvoice.ShipAddressBlock.Addr4.GetValue() : (qbInvoice.ShipAddress != null && qbInvoice.ShipAddress.Addr4 != null ? qbInvoice.ShipAddress.Addr4.GetValue() : ""),
                            shipAddress5 = qbInvoice.ShipAddressBlock != null && qbInvoice.ShipAddressBlock.Addr5 != null ? qbInvoice.ShipAddressBlock.Addr5.GetValue() : (qbInvoice.ShipAddress != null && qbInvoice.ShipAddress.Addr5 != null ? qbInvoice.ShipAddress.Addr5.GetValue() : ""),

                            tinNo = LookupCustomField(customFields, "TIN", "CustomFieldTIN", "TINNO"),
                            pwdNo = LookupCustomField(customFields, "PWDNO", "PWD NO", "CustomFieldPWDNO"),
                            drNo = LookupCustomField(customFields, "DRNO", "DR NO", "CustomFieldDRNO"),
                            jobOrderNo = LookupCustomField(customFields, "JOBORDERNO", "JOB ORDER NO", "CustomFieldJOBORDERNO"),
                            soNumber = LookupCustomField(customFields, "SONO", "SO NO", "CustomFieldSONO"),
                            businessStyle = LookupCustomField(customFields, "BUSINESSSTYLE", "BUSINESS STYLE", "CustomFieldBUSINESSSTYLE"),
                            storeCode = LookupCustomField(customFields, "STORECODE", "STORE CODE", "CustomFieldSTORECODE"),
                            attention = LookupCustomField(customFields, "ATTENTION", "CustomFieldATTENTION"),

                            customFields = customFields,
                            lineItems = new List<InvoiceLineItemDto>()
                        };

                        if (qbInvoice.ORInvoiceLineRetList != null)
                        {
                            var uomCache = new Dictionary<string, string>();
                            for (int j = 0; j < qbInvoice.ORInvoiceLineRetList.Count; j++)
                            {
                                var orLine = qbInvoice.ORInvoiceLineRetList.GetAt(j);
                                if (orLine != null && orLine.InvoiceLineRet != null)
                                {
                                    var line = orLine.InvoiceLineRet;
                                    string uomListID = line.OverrideUOMSetRef != null && line.OverrideUOMSetRef.ListID != null
                                        ? line.OverrideUOMSetRef.ListID.GetValue()
                                        : "";
                                    string finalUOM = line.UnitOfMeasure != null ? line.UnitOfMeasure.GetValue() : "";
                                    if (!string.IsNullOrEmpty(uomListID))
                                    {
                                        if (!uomCache.ContainsKey(uomListID))
                                            uomCache[uomListID] = GetUOMAbbreviation(sessionManager, uomListID);
                                        if (!string.IsNullOrEmpty(uomCache[uomListID]))
                                            finalUOM = uomCache[uomListID];
                                    }

                                    double lineAmt = line.Amount != null ? line.Amount.GetValue() : 0.0;
                                    double lineRate = line.ORRate != null && line.ORRate.Rate != null ? line.ORRate.Rate.GetValue() : 0.0;
                                    double lineTaxAmt = line.TaxAmount != null ? line.TaxAmount.GetValue() : salesTaxTotal;

                                    dto.lineItems.Add(new InvoiceLineItemDto
                                    {
                                        itemName = line.ItemRef != null && line.ItemRef.FullName != null ? line.ItemRef.FullName.GetValue() : "",
                                        description = line.Desc != null ? line.Desc.GetValue() : "",
                                        quantity = line.Quantity != null ? line.Quantity.GetValue() : 0.0,
                                        unitOfMeasure = finalUOM,
                                        rate = lineRate,
                                        amount = lineAmt,
                                        totalAmount = balanceRemaining > 0 ? balanceRemaining : totalAmount,
                                        expirationDate = line.Other1 != null ? line.Other1.GetValue() : "",
                                        skuCode = line.Other2 != null ? line.Other2.GetValue() : "",
                                        tax = line.SalesTaxCodeRef != null && line.SalesTaxCodeRef.FullName != null ? line.SalesTaxCodeRef.FullName.GetValue() : "",
                                        taxesName = taxesName,
                                        salesTaxTotal = lineTaxAmt > 0 ? lineTaxAmt : salesTaxTotal,
                                        salesrep = salesRep,
                                        serviceDate = line.ServiceDate != null ? line.ServiceDate.GetValue().ToShortDateString() : ""
                                    });
                                }
                            }
                        }

                        invoices.Add(dto);
                    }
                }
            }
            finally
            {
                try { sessionManager.EndSession(); } catch { }
                try { sessionManager.CloseConnection(); } catch { }
            }

            return invoices;
        }

        private static List<InvoiceDataDto> GetSalesOrdersByRefNumber(string refNumber, string appName)
        {
            QBSessionManager sessionManager = new QBSessionManagerClass();
            List<InvoiceDataDto> orders = new List<InvoiceDataDto>();

            try
            {
                sessionManager.OpenConnection("", appName);
                sessionManager.BeginSession("", ENOpenMode.omDontCare);

                IMsgSetRequest requestMsgSet = sessionManager.CreateMsgSetRequest("US", 13, 0);
                requestMsgSet.Attributes.OnError = ENRqOnError.roeStop;

                ISalesOrderQuery soQuery = requestMsgSet.AppendSalesOrderQueryRq();
                soQuery.IncludeLineItems.SetValue(true);
                soQuery.OwnerIDList.Add("0");

                soQuery.ORTxnNoAccountQuery.TxnFilterNoAccount.ORRefNumberFilter.RefNumberFilter.MatchCriterion.SetValue(ENMatchCriterion.mcStartsWith);
                soQuery.ORTxnNoAccountQuery.TxnFilterNoAccount.ORRefNumberFilter.RefNumberFilter.RefNumber.SetValue(refNumber);

                IMsgSetResponse responseMsgSet = sessionManager.DoRequests(requestMsgSet);
                IResponse response = responseMsgSet.ResponseList.GetAt(0);
                ISalesOrderRetList soList = response.Detail as ISalesOrderRetList;

                if (soList != null && soList.Count > 0)
                {
                    for (int i = 0; i < soList.Count; i++)
                    {
                        ISalesOrderRet qbSO = soList.GetAt(i);
                        string foundRef = qbSO.RefNumber != null ? qbSO.RefNumber.GetValue() : "";
                        if (!string.Equals(foundRef, refNumber, StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        var customFields = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        if (qbSO.DataExtRetList != null)
                        {
                            for (int k = 0; k < qbSO.DataExtRetList.Count; k++)
                            {
                                IDataExtRet dataExt = qbSO.DataExtRetList.GetAt(k);
                                customFields[dataExt.DataExtName.GetValue()] = dataExt.DataExtValue.GetValue();
                            }
                        }

                        var dto = new InvoiceDataDto
                        {
                            refNumber = foundRef,
                            customerName = qbSO.CustomerRef != null && qbSO.CustomerRef.FullName != null ? qbSO.CustomerRef.FullName.GetValue() : "",
                            txnDate = qbSO.TxnDate != null ? qbSO.TxnDate.GetValue().ToString("MM/dd/yyyy") : "",
                            dueDate = qbSO.DueDate != null ? qbSO.DueDate.GetValue().ToString("MM/dd/yyyy") : "",
                            subtotal = qbSO.Subtotal != null ? qbSO.Subtotal.GetValue() : 0.0,
                            totalAmount = qbSO.TotalAmount != null ? qbSO.TotalAmount.GetValue() : 0.0,
                            balanceRemaining = qbSO.TotalAmount != null ? qbSO.TotalAmount.GetValue() : 0.0,
                            terms = qbSO.TermsRef != null && qbSO.TermsRef.FullName != null ? qbSO.TermsRef.FullName.GetValue() : "",
                            poNumber = qbSO.PONumber != null ? qbSO.PONumber.GetValue() : "",
                            shipAddress1 = qbSO.ShipAddressBlock != null && qbSO.ShipAddressBlock.Addr1 != null ? qbSO.ShipAddressBlock.Addr1.GetValue() : "",
                            shipAddress2 = qbSO.ShipAddressBlock != null && qbSO.ShipAddressBlock.Addr2 != null ? qbSO.ShipAddressBlock.Addr2.GetValue() : "",
                            shipAddress3 = qbSO.ShipAddressBlock != null && qbSO.ShipAddressBlock.Addr3 != null ? qbSO.ShipAddressBlock.Addr3.GetValue() : "",
                            shipAddress4 = qbSO.ShipAddressBlock != null && qbSO.ShipAddressBlock.Addr4 != null ? qbSO.ShipAddressBlock.Addr4.GetValue() : "",
                            shipAddress5 = qbSO.ShipAddressBlock != null && qbSO.ShipAddressBlock.Addr5 != null ? qbSO.ShipAddressBlock.Addr5.GetValue() : "",
                            tinNo = LookupCustomField(customFields, "TIN"),
                            businessStyle = LookupCustomField(customFields, "BUSINESS STYLE", "BUSINESSSTYLE"),
                            storeCode = LookupCustomField(customFields, "STORE CODE", "STORECODE"),
                            customFields = customFields,
                            lineItems = new List<InvoiceLineItemDto>()
                        };

                        if (qbSO.ORSalesOrderLineRetList != null)
                        {
                            var uomCache = new Dictionary<string, string>();
                            for (int j = 0; j < qbSO.ORSalesOrderLineRetList.Count; j++)
                            {
                                var orLine = qbSO.ORSalesOrderLineRetList.GetAt(j);
                                if (orLine != null && orLine.SalesOrderLineRet != null)
                                {
                                    var line = orLine.SalesOrderLineRet;
                                    string uomListID = line.OverrideUOMSetRef != null && line.OverrideUOMSetRef.ListID != null
                                        ? line.OverrideUOMSetRef.ListID.GetValue()
                                        : "";
                                    string finalUOM = line.UnitOfMeasure != null ? line.UnitOfMeasure.GetValue() : "";
                                    if (!string.IsNullOrEmpty(uomListID))
                                    {
                                        if (!uomCache.ContainsKey(uomListID))
                                            uomCache[uomListID] = GetUOMAbbreviation(sessionManager, uomListID);
                                        if (!string.IsNullOrEmpty(uomCache[uomListID]))
                                            finalUOM = uomCache[uomListID];
                                    }

                                    dto.lineItems.Add(new InvoiceLineItemDto
                                    {
                                        itemName = line.ItemRef != null && line.ItemRef.FullName != null ? line.ItemRef.FullName.GetValue() : "",
                                        description = line.Desc != null ? line.Desc.GetValue() : "",
                                        quantity = line.Quantity != null ? line.Quantity.GetValue() : 0.0,
                                        unitOfMeasure = finalUOM,
                                        rate = line.ORRate != null && line.ORRate.Rate != null ? line.ORRate.Rate.GetValue() : 0.0,
                                        amount = line.Amount != null ? line.Amount.GetValue() : 0.0,
                                        totalAmount = dto.totalAmount,
                                        skuCode = line.Other1 != null ? line.Other1.GetValue() : "",
                                        expirationDate = line.Other2 != null ? line.Other2.GetValue() : ""
                                    });
                                }
                            }
                        }

                        orders.Add(dto);
                    }
                }
            }
            finally
            {
                try { sessionManager.EndSession(); } catch { }
                try { sessionManager.CloseConnection(); } catch { }
            }

            return orders;
        }

        private static List<TransferInventoryDto> GetTransferInventoryByRefNumber(string refNumber)
        {
            QBSessionManager sessionManager = new QBSessionManagerClass();
            List<TransferInventoryDto> transfers = new List<TransferInventoryDto>();

            try
            {
                sessionManager.OpenConnection("", "QBSI");
                sessionManager.BeginSession("", ENOpenMode.omDontCare);

                IMsgSetRequest requestMsgSet = sessionManager.CreateMsgSetRequest("US", 13, 0);
                requestMsgSet.Attributes.OnError = ENRqOnError.roeContinue;

                var tiQuery = requestMsgSet.AppendTransferInventoryQueryRq();
                tiQuery.IncludeLineItems.SetValue(true);
                tiQuery.ORTransferInventoryQuery.TxnFilterNoCurrency.ORRefNumberFilter.RefNumberFilter.RefNumber.SetValue(refNumber);
                tiQuery.ORTransferInventoryQuery.TxnFilterNoCurrency.ORRefNumberFilter.RefNumberFilter.MatchCriterion.SetValue(ENMatchCriterion.mcStartsWith);

                var responseMsgSet = sessionManager.DoRequests(requestMsgSet);
                if (responseMsgSet != null && responseMsgSet.ResponseList != null)
                {
                    for (int i = 0; i < responseMsgSet.ResponseList.Count; i++)
                    {
                        var response = responseMsgSet.ResponseList.GetAt(i);
                        var tiList = response.Detail as ITransferInventoryRetList;
                        if (tiList != null)
                        {
                            for (int j = 0; j < tiList.Count; j++)
                            {
                                var ti = tiList.GetAt(j);
                                string rNum = ti.RefNumber != null ? ti.RefNumber.GetValue() : "";
                                if (!string.Equals(rNum, refNumber, StringComparison.OrdinalIgnoreCase))
                                    continue;

                                var tDto = new TransferInventoryDto
                                {
                                    txnId = ti.TxnID != null ? ti.TxnID.GetValue() : "",
                                    refNumber = rNum,
                                    txnDate = ti.TxnDate != null ? ti.TxnDate.GetValue().ToString("MM/dd/yyyy") : "",
                                    lines = new List<TransferInventoryLineDto>()
                                };

                                if (ti.TransferInventoryLineRetList != null)
                                {
                                    for (int k = 0; k < ti.TransferInventoryLineRetList.Count; k++)
                                    {
                                        var line = ti.TransferInventoryLineRetList.GetAt(k);
                                        tDto.lines.Add(new TransferInventoryLineDto
                                        {
                                            itemRefListId = line.ItemRef != null && line.ItemRef.ListID != null ? line.ItemRef.ListID.GetValue() : "",
                                            quantityTransfer = line.QuantityTransferred != null ? line.QuantityTransferred.GetValue() : 0.0,
                                            siteListId = ti.ToInventorySiteRef != null && ti.ToInventorySiteRef.ListID != null ? ti.ToInventorySiteRef.ListID.GetValue() : ""
                                        });
                                    }
                                }

                                transfers.Add(tDto);
                            }
                        }
                    }
                }

                // Resolve Items, UOMs, and Sites
                var itemIDs = transfers.SelectMany(t => t.lines).Select(l => l.itemRefListId).Where(id => !string.IsNullOrEmpty(id)).Distinct().ToList();
                var items = GetItemsByListIDs(sessionManager, itemIDs);
                var uomIDs = items.Values.Select(x => x.UnitOfMeasureListID).Where(id => !string.IsNullOrEmpty(id)).Distinct().ToList();
                var uoms = GetBaseUnitNamesByListIDs(sessionManager, uomIDs);
                var siteIDs = transfers.SelectMany(t => t.lines).Select(l => l.siteListId).Where(id => !string.IsNullOrEmpty(id)).Distinct().ToList();
                var sites = GetInventorySitesByListIDs(sessionManager, siteIDs);

                foreach (var tr in transfers)
                {
                    foreach (var line in tr.lines)
                    {
                        ItemMeta item;
                        if (!string.IsNullOrEmpty(line.itemRefListId) && items.TryGetValue(line.itemRefListId, out item))
                        {
                            line.salesPrice = item.SalesPrice;
                            line.itemDescription = item.SalesDesc;
                            line.averageCost = item.AverageCost;
                            line.amount = line.quantityTransfer * item.AverageCost;

                            string baseUnit;
                            if (!string.IsNullOrEmpty(item.UnitOfMeasureListID) && uoms.TryGetValue(item.UnitOfMeasureListID, out baseUnit))
                            {
                                line.baseUnitName = baseUnit;
                            }
                        }

                        SiteMeta site;
                        if (!string.IsNullOrEmpty(line.siteListId) && sites.TryGetValue(line.siteListId, out site))
                        {
                            line.siteName = site.Name;
                            line.siteDescription = site.Description;
                            line.siteAddr1 = site.Addr1;
                            line.siteAddr2 = site.Addr2;
                            line.siteAddr3 = site.Addr3;
                            line.siteAddr4 = site.Addr4;
                            line.siteAddr5 = site.Addr5;
                        }
                    }
                }
            }
            finally
            {
                try { sessionManager.EndSession(); } catch { }
                try { sessionManager.CloseConnection(); } catch { }
            }

            return transfers;
        }

        private static Dictionary<string, ItemMeta> GetItemsByListIDs(QBSessionManager sessionManager, List<string> itemListIDs)
        {
            var items = new Dictionary<string, ItemMeta>(StringComparer.OrdinalIgnoreCase);
            if (itemListIDs == null || itemListIDs.Count == 0) return items;

            IMsgSetRequest requestMsgSet = sessionManager.CreateMsgSetRequest("US", 13, 0);
            requestMsgSet.Attributes.OnError = ENRqOnError.roeContinue;

            foreach (var id in itemListIDs)
            {
                IItemInventoryQuery invQuery = requestMsgSet.AppendItemInventoryQueryRq();
                invQuery.ORListQueryWithOwnerIDAndClass.ListIDList.Add(id);
                invQuery.IncludeRetElementList.Add("ListID");
                invQuery.IncludeRetElementList.Add("UnitOfMeasureSetRef");
                invQuery.IncludeRetElementList.Add("SalesPrice");
                invQuery.IncludeRetElementList.Add("SalesDesc");
                invQuery.IncludeRetElementList.Add("AverageCost");
            }

            var responseMsgSet = sessionManager.DoRequests(requestMsgSet);
            if (responseMsgSet != null && responseMsgSet.ResponseList != null)
            {
                for (int i = 0; i < responseMsgSet.ResponseList.Count; i++)
                {
                    var response = responseMsgSet.ResponseList.GetAt(i);
                    var invList = response.Detail as IItemInventoryRetList;
                    if (invList != null)
                    {
                        for (int j = 0; j < invList.Count; j++)
                        {
                            var invItem = invList.GetAt(j);
                            string lid = invItem.ListID != null ? invItem.ListID.GetValue() : "";
                            if (!string.IsNullOrEmpty(lid))
                            {
                                items[lid] = new ItemMeta
                                {
                                    ListID = lid,
                                    UnitOfMeasureListID = invItem.UnitOfMeasureSetRef != null && invItem.UnitOfMeasureSetRef.ListID != null ? invItem.UnitOfMeasureSetRef.ListID.GetValue() : "",
                                    SalesPrice = invItem.SalesPrice != null ? invItem.SalesPrice.GetValue() : 0.0,
                                    SalesDesc = invItem.SalesDesc != null ? invItem.SalesDesc.GetValue() : "",
                                    AverageCost = invItem.AverageCost != null ? invItem.AverageCost.GetValue() : 0.0
                                };
                            }
                        }
                    }
                }
            }
            return items;
        }

        private static Dictionary<string, string> GetBaseUnitNamesByListIDs(QBSessionManager sessionManager, List<string> uomListIDs)
        {
            var uomBaseNames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (uomListIDs == null || uomListIDs.Count == 0) return uomBaseNames;

            IMsgSetRequest requestMsgSet = sessionManager.CreateMsgSetRequest("US", 13, 0);
            requestMsgSet.Attributes.OnError = ENRqOnError.roeContinue;

            foreach (var id in uomListIDs)
            {
                IUnitOfMeasureSetQuery uomQuery = requestMsgSet.AppendUnitOfMeasureSetQueryRq();
                uomQuery.ORListQuery.ListIDList.Add(id);
                uomQuery.IncludeRetElementList.Add("ListID");
                uomQuery.IncludeRetElementList.Add("BaseUnit");
            }

            var responseMsgSet = sessionManager.DoRequests(requestMsgSet);
            if (responseMsgSet != null && responseMsgSet.ResponseList != null)
            {
                for (int i = 0; i < responseMsgSet.ResponseList.Count; i++)
                {
                    var response = responseMsgSet.ResponseList.GetAt(i);
                    var uomList = response.Detail as IUnitOfMeasureSetRetList;
                    if (uomList != null)
                    {
                        for (int j = 0; j < uomList.Count; j++)
                        {
                            var uom = uomList.GetAt(j);
                            string lid = uom.ListID != null ? uom.ListID.GetValue() : "";
                            if (!string.IsNullOrEmpty(lid))
                            {
                                uomBaseNames[lid] = uom.BaseUnit != null && uom.BaseUnit.Name != null ? uom.BaseUnit.Name.GetValue() : "";
                            }
                        }
                    }
                }
            }
            return uomBaseNames;
        }

        private static Dictionary<string, SiteMeta> GetInventorySitesByListIDs(QBSessionManager sessionManager, List<string> siteListIDs)
        {
            var sites = new Dictionary<string, SiteMeta>(StringComparer.OrdinalIgnoreCase);
            if (siteListIDs == null || siteListIDs.Count == 0) return sites;

            IMsgSetRequest requestMsgSet = sessionManager.CreateMsgSetRequest("US", 13, 0);
            requestMsgSet.Attributes.OnError = ENRqOnError.roeContinue;

            foreach (var id in siteListIDs)
            {
                IInventorySiteQuery siteQuery = requestMsgSet.AppendInventorySiteQueryRq();
                siteQuery.ORInventorySiteQuery.ListIDList.Add(id);
                siteQuery.IncludeRetElementList.Add("ListID");
                siteQuery.IncludeRetElementList.Add("Name");
                siteQuery.IncludeRetElementList.Add("SiteDesc");
                siteQuery.IncludeRetElementList.Add("SiteAddressBlock");
            }

            var responseMsgSet = sessionManager.DoRequests(requestMsgSet);
            if (responseMsgSet != null && responseMsgSet.ResponseList != null)
            {
                for (int i = 0; i < responseMsgSet.ResponseList.Count; i++)
                {
                    var response = responseMsgSet.ResponseList.GetAt(i);
                    var siteList = response.Detail as IInventorySiteRetList;
                    if (siteList != null)
                    {
                        for (int j = 0; j < siteList.Count; j++)
                        {
                            var site = siteList.GetAt(j);
                            string lid = site.ListID != null ? site.ListID.GetValue() : "";
                            if (!string.IsNullOrEmpty(lid))
                            {
                                sites[lid] = new SiteMeta
                                {
                                    ListID = lid,
                                    Name = site.Name != null ? site.Name.GetValue() : "",
                                    Description = site.SiteDesc != null ? site.SiteDesc.GetValue() : "",
                                    Addr1 = site.SiteAddressBlock != null && site.SiteAddressBlock.Addr1 != null ? site.SiteAddressBlock.Addr1.GetValue() : "",
                                    Addr2 = site.SiteAddressBlock != null && site.SiteAddressBlock.Addr2 != null ? site.SiteAddressBlock.Addr2.GetValue() : "",
                                    Addr3 = site.SiteAddressBlock != null && site.SiteAddressBlock.Addr3 != null ? site.SiteAddressBlock.Addr3.GetValue() : "",
                                    Addr4 = site.SiteAddressBlock != null && site.SiteAddressBlock.Addr4 != null ? site.SiteAddressBlock.Addr4.GetValue() : "",
                                    Addr5 = site.SiteAddressBlock != null && site.SiteAddressBlock.Addr5 != null ? site.SiteAddressBlock.Addr5.GetValue() : ""
                                };
                            }
                        }
                    }
                }
            }
            return sites;
        }

        private static string GetUOMAbbreviation(QBSessionManager sessionManager, string uomListID)
        {
            if (string.IsNullOrEmpty(uomListID)) return "";
            try
            {
                IMsgSetRequest requestMsgSet = sessionManager.CreateMsgSetRequest("US", 13, 0);
                requestMsgSet.Attributes.OnError = ENRqOnError.roeStop;

                IUnitOfMeasureSetQuery uomQuery = requestMsgSet.AppendUnitOfMeasureSetQueryRq();
                uomQuery.ORListQuery.ListIDList.Add(uomListID);

                IMsgSetResponse responseMsgSet = sessionManager.DoRequests(requestMsgSet);
                IResponse response = responseMsgSet.ResponseList.GetAt(0);
                IUnitOfMeasureSetRetList uomList = response.Detail as IUnitOfMeasureSetRetList;

                if (uomList != null && uomList.Count > 0)
                {
                    IUnitOfMeasureSetRet uom = uomList.GetAt(0);
                    return uom.BaseUnit != null && uom.BaseUnit.Abbreviation != null ? uom.BaseUnit.Abbreviation.GetValue() : "";
                }
            }
            catch { }
            return "";
        }

        private static Dictionary<string, string> GetCustomerCustomFields(QBSessionManager sessionManager, string customerListID)
        {
            var customFields = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                IMsgSetRequest custRequest = sessionManager.CreateMsgSetRequest("US", 13, 0);
                custRequest.Attributes.OnError = ENRqOnError.roeStop;

                ICustomerQuery custQuery = custRequest.AppendCustomerQueryRq();
                custQuery.ORCustomerListQuery.ListIDList.Add(customerListID);
                custQuery.OwnerIDList.Add("0");

                IMsgSetResponse custResponse = sessionManager.DoRequests(custRequest);
                IResponse custResp = custResponse.ResponseList.GetAt(0);
                ICustomerRetList custList = custResp.Detail as ICustomerRetList;

                if (custList != null && custList.Count > 0)
                {
                    ICustomerRet customer = custList.GetAt(0);
                    if (customer.DataExtRetList != null)
                    {
                        for (int i = 0; i < customer.DataExtRetList.Count; i++)
                        {
                            IDataExtRet dataExt = customer.DataExtRetList.GetAt(i);
                            string name = dataExt.DataExtName != null ? dataExt.DataExtName.GetValue() : "";
                            string value = dataExt.DataExtValue != null ? dataExt.DataExtValue.GetValue() : "";
                            if (!string.IsNullOrEmpty(name))
                            {
                                customFields[name] = value;
                            }
                        }
                    }
                }
            }
            catch { }
            return customFields;
        }
    }
}
