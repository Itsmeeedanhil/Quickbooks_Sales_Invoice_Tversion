use crate::{InvoiceData, InvoiceLineItem, TransferInventoryData, TransferInventoryLineData};
use chrono::NaiveDate;
use std::collections::HashMap;
use std::mem::ManuallyDrop;
use windows::core::{BSTR, GUID, HSTRING, PCWSTR};
use windows::Win32::System::Com::{
    CLSIDFromProgID, CoCreateInstance, CoInitializeEx, CoUninitialize, IDispatch,
    CLSCTX_INPROC_SERVER, CLSCTX_LOCAL_SERVER, COINIT_APARTMENTTHREADED, DISPATCH_METHOD,
    DISPPARAMS,
};
use windows::Win32::System::Variant::{
    VariantClear, VARIANT, VARIANT_0, VARIANT_0_0, VARIANT_0_0_0, VT_BSTR, VT_EMPTY, VT_I4,
};

struct ComGuard;
impl ComGuard {
    fn new() -> Result<Self, String> {
        unsafe {
            let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            if hr.is_err() && hr.0 != 1 {
                // S_FALSE (1) means already initialized on this thread
                return Err(format!("Failed to initialize COM: {:?}", hr));
            }
        }
        Ok(ComGuard)
    }
}
impl Drop for ComGuard {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}

fn make_bstr_variant(s: &str) -> VARIANT {
    let mut v = VARIANT::default();
    let mut inner = VARIANT_0_0::default();
    inner.vt = VT_BSTR;
    inner.Anonymous = VARIANT_0_0_0 {
        bstrVal: ManuallyDrop::new(BSTR::from(s)),
    };
    v.Anonymous = VARIANT_0 {
        Anonymous: ManuallyDrop::new(inner),
    };
    v
}

fn make_i4_variant(val: i32) -> VARIANT {
    let mut v = VARIANT::default();
    let mut inner = VARIANT_0_0::default();
    inner.vt = VT_I4;
    inner.Anonymous = VARIANT_0_0_0 { lVal: val };
    v.Anonymous = VARIANT_0 {
        Anonymous: ManuallyDrop::new(inner),
    };
    v
}

fn variant_to_string(v: &VARIANT) -> String {
    unsafe {
        let inner = &v.Anonymous.Anonymous;
        if inner.vt == VT_BSTR {
            inner.Anonymous.bstrVal.to_string()
        } else {
            String::new()
        }
    }
}

fn clear_variant(v: &mut VARIANT) {
    unsafe {
        let _ = VariantClear(v);
    }
}

unsafe fn invoke_dispatch(
    disp: &IDispatch,
    method_name: &str,
    args_in_order: &mut [VARIANT],
) -> Result<String, String> {
    let name_hstr = HSTRING::from(method_name);
    let name_pcwstr = PCWSTR(name_hstr.as_ptr());
    let mut dispid: i32 = 0;

    disp.GetIDsOfNames(&GUID::zeroed(), &name_pcwstr, 1, 0x0409, &mut dispid)
        .map_err(|e| format!("COM GetIDsOfNames({}) failed: {}", method_name, e))?;

    // COM IDispatch::Invoke expects arguments in reverse order
    args_in_order.reverse();

    let params = DISPPARAMS {
        rgvarg: if args_in_order.is_empty() {
            std::ptr::null_mut()
        } else {
            args_in_order.as_mut_ptr()
        },
        rgdispidNamedArgs: std::ptr::null_mut(),
        cArgs: args_in_order.len() as u32,
        cNamedArgs: 0,
    };

    let mut result_var = VARIANT::default();
    let invoke_res = disp.Invoke(
        dispid,
        &GUID::zeroed(),
        0x0409,
        DISPATCH_METHOD,
        &params,
        Some(&mut result_var),
        None,
        None,
    );

    for arg in args_in_order.iter_mut() {
        clear_variant(arg);
    }

    invoke_res.map_err(|e| format!("QuickBooks COM {} failed: {}", method_name, e))?;

    let out = variant_to_string(&result_var);
    if result_var.Anonymous.Anonymous.vt != VT_EMPTY {
        clear_variant(&mut result_var);
    }
    Ok(out)
}

struct QbSession {
    disp: IDispatch,
    ticket: Option<String>,
    connected: bool,
    _com: ComGuard,
}

impl QbSession {
    fn open(app_name: &str, single_user: bool) -> Result<Self, String> {
        let com = ComGuard::new()?;
        unsafe {
            let prog_id_2 = HSTRING::from("QBXMLRP2.RequestProcessor.2");
            let prog_id_1 = HSTRING::from("QBXMLRP2.RequestProcessor");

            let clsid = CLSIDFromProgID(PCWSTR(prog_id_2.as_ptr()))
                .or_else(|_| CLSIDFromProgID(PCWSTR(prog_id_1.as_ptr())))
                .map_err(|e| {
                    format!(
                        "QuickBooks Desktop RequestProcessor (QBXMLRP2) is not registered: {}",
                        e
                    )
                })?;

            let disp: IDispatch = CoCreateInstance(
                &clsid,
                None,
                CLSCTX_INPROC_SERVER | CLSCTX_LOCAL_SERVER,
            )
            .map_err(|e| format!("Failed to instantiate QuickBooks RequestProcessor: {}", e))?;

            // OpenConnection2("", appName, 1 = localQBD) or fallback to OpenConnection("", appName)
            let mut open2_args = [
                make_bstr_variant(""),
                make_bstr_variant(app_name),
                make_i4_variant(1),
            ];
            if invoke_dispatch(&disp, "OpenConnection2", &mut open2_args).is_err() {
                let mut open_args = [make_bstr_variant(""), make_bstr_variant(app_name)];
                invoke_dispatch(&disp, "OpenConnection", &mut open_args)?;
            }

            // 0 = qbFileOpenSingleUser, 2 = qbFileOpenDoNotCare
            let file_mode = if single_user { 0 } else { 2 };
            let mut begin_args = [make_bstr_variant(""), make_i4_variant(file_mode)];
            let ticket = match invoke_dispatch(&disp, "BeginSession", &mut begin_args) {
                Ok(t) => t,
                Err(e) => {
                    let _ = invoke_dispatch(&disp, "CloseConnection", &mut []);
                    return Err(e);
                }
            };

            Ok(QbSession {
                disp,
                ticket: Some(ticket),
                connected: true,
                _com: com,
            })
        }
    }

    fn process_request(&self, request_xml: &str) -> Result<String, String> {
        let ticket = self
            .ticket
            .as_ref()
            .ok_or_else(|| "No active QuickBooks session ticket.".to_string())?;
        unsafe {
            let mut args = [make_bstr_variant(ticket), make_bstr_variant(request_xml)];
            invoke_dispatch(&self.disp, "ProcessRequest", &mut args)
        }
    }
}

impl Drop for QbSession {
    fn drop(&mut self) {
        unsafe {
            if let Some(ref t) = self.ticket {
                let mut args = [make_bstr_variant(t)];
                let _ = invoke_dispatch(&self.disp, "EndSession", &mut args);
            }
            if self.connected {
                let _ = invoke_dispatch(&self.disp, "CloseConnection", &mut []);
            }
        }
    }
}

// ============================================================================
// Lightweight XML Helpers (zero external dependencies)
// ============================================================================

fn xml_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn xml_unescape(input: &str) -> String {
    input
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

/// Extracts the inner content of the first `<tag>...</tag>` inside `xml`
fn get_xml_tag(xml: &str, tag: &str) -> String {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    if let Some(start_idx) = xml.find(&open) {
        let content_start = start_idx + open.len();
        if let Some(end_offset) = xml[content_start..].find(&close) {
            return xml_unescape(xml[content_start..content_start + end_offset].trim());
        }
    }
    String::new()
}

/// Extracts inner content of `<parent>...<child>VALUE</child>...</parent>`
fn get_nested_xml_tag(xml: &str, parent: &str, child: &str) -> String {
    let open = format!("<{}>", parent);
    let close = format!("</{}>", parent);
    if let Some(start_idx) = xml.find(&open) {
        let content_start = start_idx + open.len();
        if let Some(end_offset) = xml[content_start..].find(&close) {
            let block = &xml[content_start..content_start + end_offset];
            return get_xml_tag(block, child);
        }
    }
    String::new()
}

/// Extracts all occurrences of `<tag ...>...</tag>` or `<tag>...</tag>` blocks
fn get_all_xml_blocks<'a>(xml: &'a str, tag: &str) -> Vec<&'a str> {
    let mut blocks = Vec::new();
    let open_exact = format!("<{}>", tag);
    let open_attr = format!("<{} ", tag);
    let close = format!("</{}>", tag);

    let mut cursor = 0;
    while cursor < xml.len() {
        let slice = &xml[cursor..];
        let next_exact = slice.find(&open_exact);
        let next_attr = slice.find(&open_attr);

        let match_pos = match (next_exact, next_attr) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (Some(a), None) => Some(a),
            (None, Some(b)) => Some(b),
            (None, None) => None,
        };

        if let Some(pos) = match_pos {
            let tag_start = cursor + pos;
            if let Some(gt_offset) = xml[tag_start..].find('>') {
                let inner_start = tag_start + gt_offset + 1;
                if let Some(close_offset) = xml[inner_start..].find(&close) {
                    let inner_end = inner_start + close_offset;
                    blocks.push(&xml[inner_start..inner_end]);
                    cursor = inner_end + close.len();
                    continue;
                }
            }
            break;
        } else {
            break;
        }
    }
    blocks
}

fn format_qb_date(raw_date: &str) -> String {
    if raw_date.is_empty() {
        return String::new();
    }
    if let Ok(d) = NaiveDate::parse_from_str(raw_date, "%Y-%m-%d") {
        return d.format("%m/%d/%Y").to_string();
    }
    raw_date.to_string()
}

fn parse_f64(s: &str) -> f64 {
    s.trim().parse::<f64>().unwrap_or(0.0)
}

fn normalize_field_key(k: &str) -> String {
    k.chars()
        .filter(|c| !matches!(c, ' ' | '.' | '#' | '_'))
        .collect::<String>()
        .to_lowercase()
}

fn lookup_custom_field(map: &HashMap<String, String>, keys: &[&str]) -> String {
    for target in keys {
        let norm_target = normalize_field_key(target);
        for (k, v) in map {
            if normalize_field_key(k) == norm_target {
                return v.clone();
            }
        }
    }
    String::new()
}

fn fetch_customer_custom_fields(
    session: &QbSession,
    customer_list_id: &str,
) -> HashMap<String, String> {
    let mut map = HashMap::new();
    if customer_list_id.is_empty() {
        return map;
    }

    let req = format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?><?qbxml version=\"13.0\"?>\
         <QBXML><QBXMLMsgsRq onError=\"continueOnError\">\
         <CustomerQueryRq><ListID>{}</ListID><OwnerID>0</OwnerID></CustomerQueryRq>\
         </QBXMLMsgsRq></QBXML>",
        xml_escape(customer_list_id)
    );

    if let Ok(resp) = session.process_request(&req) {
        for cust in get_all_xml_blocks(&resp, "CustomerRet") {
            for ext in get_all_xml_blocks(cust, "DataExtRet") {
                let name = get_xml_tag(ext, "DataExtName");
                let val = get_xml_tag(ext, "DataExtValue");
                if !name.is_empty() {
                    map.insert(name, val);
                }
            }
        }
    }
    map
}

fn fetch_uom_abbreviation(session: &QbSession, uom_list_id: &str) -> String {
    if uom_list_id.is_empty() {
        return String::new();
    }
    let req = format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?><?qbxml version=\"13.0\"?>\
         <QBXML><QBXMLMsgsRq onError=\"continueOnError\">\
         <UnitOfMeasureSetQueryRq><ListID>{}</ListID></UnitOfMeasureSetQueryRq>\
         </QBXMLMsgsRq></QBXML>",
        xml_escape(uom_list_id)
    );
    if let Ok(resp) = session.process_request(&req) {
        for uom in get_all_xml_blocks(&resp, "UnitOfMeasureSetRet") {
            let abbr = get_nested_xml_tag(uom, "BaseUnit", "Abbreviation");
            if !abbr.is_empty() {
                return abbr;
            }
        }
    }
    String::new()
}

// ============================================================================
// Public QBXML Query Functions
// ============================================================================

pub fn reauthorize_quickbooks() -> Result<(), String> {
    let ticks = chrono::Local::now().timestamp_millis();
    let app_name = format!("Quickbooks Collection Receipt {}", ticks);
    let _session = QbSession::open(&app_name, true)?;
    Ok(())
}

pub fn query_invoices_from_qb(ref_number: &str, client: &str) -> Result<Vec<InvoiceData>, String> {
    let app_name = if client == "IVP" {
        "Quickbooks Collection Receipt v3"
    } else {
        "QBSI"
    };
    let session = QbSession::open(app_name, false)?;

    let req = format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?><?qbxml version=\"13.0\"?>\
         <QBXML><QBXMLMsgsRq onError=\"stopOnError\">\
         <InvoiceQueryRq>\
         <RefNumberFilter><MatchCriterion>StartsWith</MatchCriterion><RefNumber>{}</RefNumber></RefNumberFilter>\
         <IncludeLineItems>true</IncludeLineItems>\
         <IncludeLinkedTxns>true</IncludeLinkedTxns>\
         <OwnerID>0</OwnerID>\
         </InvoiceQueryRq>\
         </QBXMLMsgsRq></QBXML>",
        xml_escape(ref_number)
    );

    let resp = session.process_request(&req)?;
    let mut invoices = Vec::new();
    let mut uom_cache: HashMap<String, String> = HashMap::new();

    for inv_block in get_all_xml_blocks(&resp, "InvoiceRet") {
        let found_ref = get_xml_tag(inv_block, "RefNumber");
        if !found_ref.eq_ignore_ascii_case(ref_number) {
            continue;
        }

        let cust_list_id = get_nested_xml_tag(inv_block, "CustomerRef", "ListID");
        let mut custom_fields = fetch_customer_custom_fields(&session, &cust_list_id);

        for ext in get_all_xml_blocks(inv_block, "DataExtRet") {
            let name = get_xml_tag(ext, "DataExtName");
            let val = get_xml_tag(ext, "DataExtValue");
            if !name.is_empty() {
                custom_fields.insert(name, val);
            }
        }

        let subtotal = parse_f64(&get_xml_tag(inv_block, "Subtotal"));
        let sales_tax_total = parse_f64(&get_xml_tag(inv_block, "SalesTaxTotal"));
        let balance_remaining = parse_f64(&get_xml_tag(inv_block, "BalanceRemaining"));
        let total_amount = subtotal + sales_tax_total;
        let effective_balance = if balance_remaining > 0.0 {
            balance_remaining
        } else {
            total_amount
        };

        let taxes_name = get_nested_xml_tag(inv_block, "ItemSalesTaxRef", "FullName");
        let salesrep = get_nested_xml_tag(inv_block, "SalesRepRef", "FullName");

        let bill_addr_tag = if inv_block.contains("<BillAddressBlock>") {
            "BillAddressBlock"
        } else {
            "BillAddress"
        };
        let ship_addr_tag = if inv_block.contains("<ShipAddressBlock>") {
            "ShipAddressBlock"
        } else {
            "ShipAddress"
        };

        let mut line_items = Vec::new();
        for line_block in get_all_xml_blocks(inv_block, "InvoiceLineRet") {
            let uom_list_id = get_nested_xml_tag(line_block, "OverrideUOMSetRef", "ListID");
            let mut final_uom = get_xml_tag(line_block, "UnitOfMeasure");
            if !uom_list_id.is_empty() {
                let abbr = uom_cache
                    .entry(uom_list_id.clone())
                    .or_insert_with(|| fetch_uom_abbreviation(&session, &uom_list_id))
                    .clone();
                if !abbr.is_empty() {
                    final_uom = abbr;
                }
            }

            let line_amt = parse_f64(&get_xml_tag(line_block, "Amount"));
            let line_rate = parse_f64(&get_xml_tag(line_block, "Rate"));
            let line_tax_amt = parse_f64(&get_xml_tag(line_block, "TaxAmount"));

            line_items.push(InvoiceLineItem {
                item_name: get_nested_xml_tag(line_block, "ItemRef", "FullName"),
                description: get_xml_tag(line_block, "Desc"),
                quantity: parse_f64(&get_xml_tag(line_block, "Quantity")),
                unit_of_measure: final_uom,
                rate: line_rate,
                amount: line_amt,
                total_amount: effective_balance,
                expiration_date: get_xml_tag(line_block, "Other1"),
                sku_code: get_xml_tag(line_block, "Other2"),
                tax: get_nested_xml_tag(line_block, "SalesTaxCodeRef", "FullName"),
                taxes_name: taxes_name.clone(),
                sales_tax_total: if line_tax_amt > 0.0 {
                    line_tax_amt
                } else {
                    sales_tax_total
                },
                salesrep: salesrep.clone(),
                service_date: format_qb_date(&get_xml_tag(line_block, "ServiceDate")),
            });
        }

        invoices.push(InvoiceData {
            ref_number: found_ref,
            customer_name: get_nested_xml_tag(inv_block, "CustomerRef", "FullName"),
            po_number: get_xml_tag(inv_block, "PONumber"),
            terms: get_nested_xml_tag(inv_block, "TermsRef", "FullName"),
            salesrep,
            taxes_name,
            txn_date: format_qb_date(&get_xml_tag(inv_block, "TxnDate")),
            due_date: format_qb_date(&get_xml_tag(inv_block, "DueDate")),
            subtotal,
            sales_tax_total,
            total_amount,
            balance_remaining: effective_balance,
            bill_address1: get_nested_xml_tag(inv_block, bill_addr_tag, "Addr1"),
            bill_address2: get_nested_xml_tag(inv_block, bill_addr_tag, "Addr2"),
            bill_address3: get_nested_xml_tag(inv_block, bill_addr_tag, "Addr3"),
            bill_address4: get_nested_xml_tag(inv_block, bill_addr_tag, "Addr4"),
            bill_address5: get_nested_xml_tag(inv_block, bill_addr_tag, "Addr5"),
            ship_address1: get_nested_xml_tag(inv_block, ship_addr_tag, "Addr1"),
            ship_address2: get_nested_xml_tag(inv_block, ship_addr_tag, "Addr2"),
            ship_address3: get_nested_xml_tag(inv_block, ship_addr_tag, "Addr3"),
            ship_address4: get_nested_xml_tag(inv_block, ship_addr_tag, "Addr4"),
            ship_address5: get_nested_xml_tag(inv_block, ship_addr_tag, "Addr5"),
            tin_no: lookup_custom_field(&custom_fields, &["TIN", "CustomFieldTIN", "TINNO"]),
            pwd_no: lookup_custom_field(&custom_fields, &["PWDNO", "PWD NO", "CustomFieldPWDNO"]),
            dr_no: lookup_custom_field(&custom_fields, &["DRNO", "DR NO", "CustomFieldDRNO"]),
            job_order_no: lookup_custom_field(
                &custom_fields,
                &["JOBORDERNO", "JOB ORDER NO", "CustomFieldJOBORDERNO"],
            ),
            so_number: lookup_custom_field(&custom_fields, &["SONO", "SO NO", "CustomFieldSONO"]),
            business_style: lookup_custom_field(
                &custom_fields,
                &["BUSINESSSTYLE", "BUSINESS STYLE", "CustomFieldBUSINESSSTYLE"],
            ),
            store_code: lookup_custom_field(
                &custom_fields,
                &["STORECODE", "STORE CODE", "CustomFieldSTORECODE"],
            ),
            attention: lookup_custom_field(&custom_fields, &["ATTENTION", "CustomFieldATTENTION"]),
            custom_fields,
            line_items,
        });
    }

    Ok(invoices)
}

pub fn query_sales_orders_from_qb(ref_number: &str) -> Result<Vec<InvoiceData>, String> {
    let session = QbSession::open("QBSI", false)?;

    let req = format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?><?qbxml version=\"13.0\"?>\
         <QBXML><QBXMLMsgsRq onError=\"stopOnError\">\
         <SalesOrderQueryRq>\
         <RefNumberFilter><MatchCriterion>StartsWith</MatchCriterion><RefNumber>{}</RefNumber></RefNumberFilter>\
         <IncludeLineItems>true</IncludeLineItems>\
         <OwnerID>0</OwnerID>\
         </SalesOrderQueryRq>\
         </QBXMLMsgsRq></QBXML>",
        xml_escape(ref_number)
    );

    let resp = session.process_request(&req)?;
    let mut orders = Vec::new();
    let mut uom_cache: HashMap<String, String> = HashMap::new();

    for so_block in get_all_xml_blocks(&resp, "SalesOrderRet") {
        let found_ref = get_xml_tag(so_block, "RefNumber");
        if !found_ref.eq_ignore_ascii_case(ref_number) {
            continue;
        }

        let mut custom_fields = HashMap::new();
        for ext in get_all_xml_blocks(so_block, "DataExtRet") {
            let name = get_xml_tag(ext, "DataExtName");
            let val = get_xml_tag(ext, "DataExtValue");
            if !name.is_empty() {
                custom_fields.insert(name, val);
            }
        }

        let subtotal = parse_f64(&get_xml_tag(so_block, "Subtotal"));
        let total_amount = parse_f64(&get_xml_tag(so_block, "TotalAmount"));
        let ship_addr_tag = if so_block.contains("<ShipAddressBlock>") {
            "ShipAddressBlock"
        } else {
            "ShipAddress"
        };

        let mut line_items = Vec::new();
        for line_block in get_all_xml_blocks(so_block, "SalesOrderLineRet") {
            let uom_list_id = get_nested_xml_tag(line_block, "OverrideUOMSetRef", "ListID");
            let mut final_uom = get_xml_tag(line_block, "UnitOfMeasure");
            if !uom_list_id.is_empty() {
                let abbr = uom_cache
                    .entry(uom_list_id.clone())
                    .or_insert_with(|| fetch_uom_abbreviation(&session, &uom_list_id))
                    .clone();
                if !abbr.is_empty() {
                    final_uom = abbr;
                }
            }

            line_items.push(InvoiceLineItem {
                item_name: get_nested_xml_tag(line_block, "ItemRef", "FullName"),
                description: get_xml_tag(line_block, "Desc"),
                quantity: parse_f64(&get_xml_tag(line_block, "Quantity")),
                unit_of_measure: final_uom,
                rate: parse_f64(&get_xml_tag(line_block, "Rate")),
                amount: parse_f64(&get_xml_tag(line_block, "Amount")),
                total_amount,
                sku_code: get_xml_tag(line_block, "Other1"),
                expiration_date: get_xml_tag(line_block, "Other2"),
                ..Default::default()
            });
        }

        orders.push(InvoiceData {
            ref_number: found_ref,
            customer_name: get_nested_xml_tag(so_block, "CustomerRef", "FullName"),
            txn_date: format_qb_date(&get_xml_tag(so_block, "TxnDate")),
            due_date: format_qb_date(&get_xml_tag(so_block, "DueDate")),
            subtotal,
            total_amount,
            balance_remaining: total_amount,
            terms: get_nested_xml_tag(so_block, "TermsRef", "FullName"),
            po_number: get_xml_tag(so_block, "PONumber"),
            ship_address1: get_nested_xml_tag(so_block, ship_addr_tag, "Addr1"),
            ship_address2: get_nested_xml_tag(so_block, ship_addr_tag, "Addr2"),
            ship_address3: get_nested_xml_tag(so_block, ship_addr_tag, "Addr3"),
            ship_address4: get_nested_xml_tag(so_block, ship_addr_tag, "Addr4"),
            ship_address5: get_nested_xml_tag(so_block, ship_addr_tag, "Addr5"),
            tin_no: lookup_custom_field(&custom_fields, &["TIN"]),
            business_style: lookup_custom_field(
                &custom_fields,
                &["BUSINESS STYLE", "BUSINESSSTYLE"],
            ),
            store_code: lookup_custom_field(&custom_fields, &["STORE CODE", "STORECODE"]),
            custom_fields,
            line_items,
            ..Default::default()
        });
    }

    Ok(orders)
}

pub fn query_transfers_from_qb(ref_number: &str) -> Result<Vec<TransferInventoryData>, String> {
    let session = QbSession::open("QBSI", false)?;

    let req = format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?><?qbxml version=\"13.0\"?>\
         <QBXML><QBXMLMsgsRq onError=\"continueOnError\">\
         <TransferInventoryQueryRq>\
         <RefNumberFilter><MatchCriterion>StartsWith</MatchCriterion><RefNumber>{}</RefNumber></RefNumberFilter>\
         <IncludeLineItems>true</IncludeLineItems>\
         </TransferInventoryQueryRq>\
         </QBXMLMsgsRq></QBXML>",
        xml_escape(ref_number)
    );

    let resp = session.process_request(&req)?;
    let mut transfers = Vec::new();

    for ti_block in get_all_xml_blocks(&resp, "TransferInventoryRet") {
        let found_ref = get_xml_tag(ti_block, "RefNumber");
        if !found_ref.eq_ignore_ascii_case(ref_number) {
            continue;
        }

        let site_list_id = get_nested_xml_tag(ti_block, "ToInventorySiteRef", "ListID");
        let mut lines = Vec::new();

        for line_block in get_all_xml_blocks(ti_block, "TransferInventoryLineRet") {
            let item_id = get_nested_xml_tag(line_block, "ItemRef", "ListID");
            let qty = parse_f64(&get_xml_tag(line_block, "QuantityTransferred"));
            lines.push(TransferInventoryLineData {
                item_ref_list_id: item_id,
                quantity_transfer: qty,
                site_list_id: site_list_id.clone(),
                ..Default::default()
            });
        }

        transfers.push(TransferInventoryData {
            txn_id: get_xml_tag(ti_block, "TxnID"),
            ref_number: found_ref,
            txn_date: format_qb_date(&get_xml_tag(ti_block, "TxnDate")),
            lines,
        });
    }

    // Resolve item details, UOMs, and site addresses
    for tr in &mut transfers {
        for line in &mut tr.lines {
            if !line.item_ref_list_id.is_empty() {
                let item_req = format!(
                    "<?xml version=\"1.0\" encoding=\"utf-8\"?><?qbxml version=\"13.0\"?>\
                     <QBXML><QBXMLMsgsRq onError=\"continueOnError\">\
                     <ItemInventoryQueryRq><ListID>{}</ListID></ItemInventoryQueryRq>\
                     </QBXMLMsgsRq></QBXML>",
                    xml_escape(&line.item_ref_list_id)
                );
                if let Ok(item_resp) = session.process_request(&item_req) {
                    if let Some(item_block) =
                        get_all_xml_blocks(&item_resp, "ItemInventoryRet").first()
                    {
                        line.sales_price = parse_f64(&get_xml_tag(item_block, "SalesPrice"));
                        line.item_description = get_xml_tag(item_block, "SalesDesc");
                        line.average_cost = parse_f64(&get_xml_tag(item_block, "AverageCost"));
                        line.amount = line.quantity_transfer * line.average_cost;

                        let uom_id =
                            get_nested_xml_tag(item_block, "UnitOfMeasureSetRef", "ListID");
                        if !uom_id.is_empty() {
                            let uom_req = format!(
                                "<?xml version=\"1.0\" encoding=\"utf-8\"?><?qbxml version=\"13.0\"?>\
                                 <QBXML><QBXMLMsgsRq onError=\"continueOnError\">\
                                 <UnitOfMeasureSetQueryRq><ListID>{}</ListID></UnitOfMeasureSetQueryRq>\
                                 </QBXMLMsgsRq></QBXML>",
                                xml_escape(&uom_id)
                            );
                            if let Ok(uom_resp) = session.process_request(&uom_req) {
                                if let Some(uom_block) =
                                    get_all_xml_blocks(&uom_resp, "UnitOfMeasureSetRet").first()
                                {
                                    line.base_unit_name =
                                        get_nested_xml_tag(uom_block, "BaseUnit", "Name");
                                }
                            }
                        }
                    }
                }
            }

            if !line.site_list_id.is_empty() {
                let site_req = format!(
                    "<?xml version=\"1.0\" encoding=\"utf-8\"?><?qbxml version=\"13.0\"?>\
                     <QBXML><QBXMLMsgsRq onError=\"continueOnError\">\
                     <InventorySiteQueryRq><ListID>{}</ListID></InventorySiteQueryRq>\
                     </QBXMLMsgsRq></QBXML>",
                    xml_escape(&line.site_list_id)
                );
                if let Ok(site_resp) = session.process_request(&site_req) {
                    if let Some(site_block) =
                        get_all_xml_blocks(&site_resp, "InventorySiteRet").first()
                    {
                        line.site_name = get_xml_tag(site_block, "Name");
                        line.site_description = get_xml_tag(site_block, "SiteDesc");
                        let addr_tag = if site_block.contains("<SiteAddressBlock>") {
                            "SiteAddressBlock"
                        } else {
                            "SiteAddress"
                        };
                        line.site_addr1 = get_nested_xml_tag(site_block, addr_tag, "Addr1");
                        line.site_addr2 = get_nested_xml_tag(site_block, addr_tag, "Addr2");
                        line.site_addr3 = get_nested_xml_tag(site_block, addr_tag, "Addr3");
                        line.site_addr4 = get_nested_xml_tag(site_block, addr_tag, "Addr4");
                        line.site_addr5 = get_nested_xml_tag(site_block, addr_tag, "Addr5");
                    }
                }
            }
        }
    }

    Ok(transfers)
}
