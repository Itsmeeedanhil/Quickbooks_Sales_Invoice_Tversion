mod qbxml;

use chrono::Local;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct AppState {
    pub appdata_dir: PathBuf,
    pub sqlite_path: PathBuf,
    pub db_mutex: Mutex<()>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceLineItem {
    pub quantity: f64,
    pub description: String,
    pub salesrep: String,
    pub item_name: String,
    pub tax: String,
    pub unit_of_measure: String,
    pub expiration_date: String,
    pub sku_code: String,
    pub taxes_name: String,
    pub rate: f64,
    pub amount: f64,
    pub total_amount: f64,
    pub sales_tax_total: f64,
    pub service_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceData {
    pub ref_number: String,
    pub tin_no: String,
    pub customer_name: String,
    pub po_number: String,
    pub dr_no: String,
    pub pwd_no: String,
    pub so_number: String,
    pub business_style: String,
    pub store_code: String,
    pub job_order_no: String,
    pub attention: String,
    pub bill_address1: String,
    pub bill_address2: String,
    pub bill_address3: String,
    pub bill_address4: String,
    pub bill_address5: String,
    pub ship_address1: String,
    pub ship_address2: String,
    pub ship_address3: String,
    pub ship_address4: String,
    pub ship_address5: String,
    pub txn_date: String,
    pub due_date: String,
    pub terms: String,
    pub salesrep: String,
    pub taxes_name: String,
    pub subtotal: f64,
    pub sales_tax_total: f64,
    pub total_amount: f64,
    pub balance_remaining: f64,
    pub line_items: Vec<InvoiceLineItem>,
    pub custom_fields: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TransferInventoryLineData {
    pub item_ref_list_id: String,
    pub quantity_transfer: f64,
    pub sales_price: f64,
    pub item_description: String,
    pub base_unit_name: String,
    pub average_cost: f64,
    pub amount: f64,
    pub site_list_id: String,
    pub site_name: String,
    pub site_description: String,
    pub site_addr1: String,
    pub site_addr2: String,
    pub site_addr3: String,
    pub site_addr4: String,
    pub site_addr5: String,
    pub expiration_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TransferInventoryData {
    pub txn_id: String,
    pub ref_number: String,
    pub txn_date: String,
    pub lines: Vec<TransferInventoryLineData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SignatoryData {
    pub prepared_by: String,
    pub checked_by: String,
    pub approved_by: String,
    pub cashier_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HistoryDRDetails {
    pub ref_number: String,
    pub address: String,
    pub terms: String,
    pub store_code: String,
    pub po_number: String,
    pub tin: String,
    pub business_style: String,
    pub note: String,
    pub customer_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DbStatus {
    pub accdb_connected: bool,
    pub accdb_path: String,
    pub sqlite_path: String,
    pub qbfc_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClientConfigResponse {
    pub client: String,
    pub series_number: i32,
    pub ac_no: String,
    pub date_issued: String,
    pub signatory: SignatoryData,
    pub dr_defaults: HistoryDRDetails,
    pub db_status: DbStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSearchResult {
    pub found: bool,
    pub source: String,
    pub invoices: Vec<InvoiceData>,
    pub transfers: Vec<TransferInventoryData>,
    pub history_dr: Option<HistoryDRDetails>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDeploymentConfig {
    pub enabled_clients: Vec<String>,
    pub default_client: String,
}

/// Resolves the runtime data directory OUTSIDE `src-tauri/` in development,
/// and inside `%LOCALAPPDATA%\CustomQBSI` when installed on a client PC so
/// database and log writes never fail due to Program Files permissions.
fn resolve_appdata_dir() -> PathBuf {
    if cfg!(debug_assertions) {
        if let Ok(cwd) = std::env::current_dir() {
            if cwd.file_name().and_then(|n| n.to_str()) == Some("src-tauri") {
                if let Some(parent) = cwd.parent() {
                    let dir = parent.join("appdata");
                    let _ = fs::create_dir_all(&dir);
                    return dir;
                }
            }
            let dir = cwd.join("appdata");
            let _ = fs::create_dir_all(&dir);
            return dir;
        }
    }

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let dir = PathBuf::from(local_app_data).join("CustomQBSI");
        let _ = fs::create_dir_all(&dir);
        return dir;
    }

    let fallback = PathBuf::from("appdata");
    let _ = fs::create_dir_all(&fallback);
    fallback
}

fn log_to_file(appdata_dir: &Path, file_name: &str, message: &str) {
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let line = format!("{} - {}\n", timestamp, message);
    let log_path = appdata_dir.join(file_name);
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = file.write_all(line.as_bytes());
    }
}

fn init_sqlite_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS SeriesNumber (
            Client TEXT PRIMARY KEY,
            Series INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS DetailedPermit (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            Client TEXT NOT NULL,
            ACNO TEXT NOT NULL DEFAULT '',
            DateIssued TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS Signatory (
            Client TEXT PRIMARY KEY,
            PreparedBy TEXT NOT NULL DEFAULT '',
            CheckedBy TEXT NOT NULL DEFAULT '',
            ApprovedBy TEXT NOT NULL DEFAULT '',
            CashierName TEXT NOT NULL DEFAULT '',
            Address TEXT NOT NULL DEFAULT '',
            Terms TEXT NOT NULL DEFAULT '',
            StoreCode TEXT NOT NULL DEFAULT '',
            PONo TEXT NOT NULL DEFAULT '',
            TINNo TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS HistoryDRDetails (
            RefNumber TEXT PRIMARY KEY,
            Address TEXT NOT NULL DEFAULT '',
            Terms TEXT NOT NULL DEFAULT '',
            StoreCode TEXT NOT NULL DEFAULT '',
            PONumber TEXT NOT NULL DEFAULT '',
            TIN TEXT NOT NULL DEFAULT '',
            BusinessStyle TEXT NOT NULL DEFAULT '',
            Note TEXT NOT NULL DEFAULT '',
            CustomerName TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS ProgrammerConfig (
            Key TEXT PRIMARY KEY,
            Value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS LayoutOffsets (
            LayoutKey TEXT PRIMARY KEY,
            OffsetsJson TEXT NOT NULL DEFAULT '{}'
        );
        ",
    )
    .map_err(|e| e.to_string())?;

    let _ = conn.execute(
        "INSERT OR IGNORE INTO ProgrammerConfig (Key, Value) VALUES ('enabled_clients', '[\"Enclosure\",\"FP\",\"PBS\",\"NHC\",\"MET\",\"IVP\",\"MEDILIGHT\"]')",
        [],
    );
    let _ = conn.execute(
        "UPDATE ProgrammerConfig SET Value = '[\"Enclosure\",\"FP\",\"PBS\",\"NHC\",\"MET\",\"IVP\",\"MEDILIGHT\"]' WHERE Key = 'enabled_clients' AND Value = '[\"Enclosure\",\"FP\",\"PBS\",\"NHC\",\"MET\",\"IVP\"]'",
        [],
    );
    let _ = conn.execute(
        "INSERT OR IGNORE INTO ProgrammerConfig (Key, Value) VALUES ('default_client', 'Enclosure')",
        [],
    );
    let _ = conn.execute(
        "INSERT OR IGNORE INTO ProgrammerConfig (Key, Value) VALUES ('passcode', 'admin1234')",
        [],
    );

    for client in ["Enclosure", "FP", "PBS", "IVP", "MET", "NHC", "MEDILIGHT"] {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO SeriesNumber (Client, Series) VALUES (?1, 1)",
            params![client],
        );
        let _ = conn.execute(
            "INSERT OR IGNORE INTO Signatory (Client) VALUES (?1)",
            params![client],
        );
    }

    Ok(())
}

#[tauri::command]
fn get_client_config(
    state: tauri::State<'_, AppState>,
    client: String,
) -> Result<ClientConfigResponse, String> {
    let _guard = state.db_mutex.lock().map_err(|e| e.to_string())?;
    let conn = Connection::open(&state.sqlite_path).map_err(|e| e.to_string())?;

    let series_number: i32 = conn
        .query_row(
            "SELECT Series FROM SeriesNumber WHERE Client = ?1",
            params![client],
            |r| r.get(0),
        )
        .unwrap_or(1);

    let (ac_no, date_issued): (String, String) = conn
        .query_row(
            "SELECT ACNO, DateIssued FROM DetailedPermit WHERE Client = ?1 ORDER BY ID DESC LIMIT 1",
            params![client],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap_or_else(|_| ("".to_string(), Local::now().format("%Y-%m-%d").to_string()));

    let (signatory, dr_defaults) = conn
        .query_row(
            "SELECT PreparedBy, CheckedBy, ApprovedBy, CashierName, Address, Terms, StoreCode, PONo, TINNo
             FROM Signatory WHERE Client = ?1",
            params![client],
            |r| {
                let sig = SignatoryData {
                    prepared_by: r.get(0).unwrap_or_default(),
                    checked_by: r.get(1).unwrap_or_default(),
                    approved_by: r.get(2).unwrap_or_default(),
                    cashier_name: r.get(3).unwrap_or_default(),
                };
                let dr = HistoryDRDetails {
                    ref_number: "".to_string(),
                    address: r.get(4).unwrap_or_default(),
                    terms: r.get(5).unwrap_or_default(),
                    store_code: r.get(6).unwrap_or_default(),
                    po_number: r.get(7).unwrap_or_default(),
                    tin: r.get(8).unwrap_or_default(),
                    business_style: "".to_string(),
                    note: "".to_string(),
                    customer_name: "".to_string(),
                };
                Ok((sig, dr))
            },
        )
        .unwrap_or_default();

    let db_status = DbStatus {
        accdb_connected: true,
        accdb_path: "Embedded SQLite Settings Store".to_string(),
        sqlite_path: state.sqlite_path.to_string_lossy().to_string(),
        qbfc_available: true,
    };

    Ok(ClientConfigResponse {
        client,
        series_number,
        ac_no,
        date_issued,
        signatory,
        dr_defaults,
        db_status,
    })
}

#[tauri::command]
fn update_series_number(
    state: tauri::State<'_, AppState>,
    client: String,
    series_number: i32,
) -> Result<(), String> {
    let _guard = state.db_mutex.lock().map_err(|e| e.to_string())?;
    let conn = Connection::open(&state.sqlite_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO SeriesNumber (Client, Series) VALUES (?1, ?2)",
        params![client, series_number],
    )
    .map_err(|e| e.to_string())?;

    log_to_file(
        &state.appdata_dir,
        "app_log.txt",
        &format!("Updated series number for {} to {}", client, series_number),
    );
    Ok(())
}

#[tauri::command]
fn update_ac_no_and_date(
    state: tauri::State<'_, AppState>,
    client: String,
    ac_no: String,
    date_issued: String,
) -> Result<(), String> {
    let _guard = state.db_mutex.lock().map_err(|e| e.to_string())?;
    let conn = Connection::open(&state.sqlite_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO DetailedPermit (Client, ACNO, DateIssued) VALUES (?1, ?2, ?3)",
        params![client, ac_no, date_issued],
    )
    .map_err(|e| e.to_string())?;

    log_to_file(
        &state.appdata_dir,
        "app_log.txt",
        &format!("Saved BIR Permit / AC No for {}: {} ({})", client, ac_no, date_issued),
    );
    Ok(())
}

#[tauri::command]
fn update_signatory(
    state: tauri::State<'_, AppState>,
    client: String,
    signatory: SignatoryData,
) -> Result<(), String> {
    let _guard = state.db_mutex.lock().map_err(|e| e.to_string())?;
    let conn = Connection::open(&state.sqlite_path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE Signatory SET PreparedBy = ?1, CheckedBy = ?2, ApprovedBy = ?3, CashierName = ?4 WHERE Client = ?5",
        params![
            signatory.prepared_by,
            signatory.checked_by,
            signatory.approved_by,
            signatory.cashier_name,
            client
        ],
    )
    .map_err(|e| e.to_string())?;

    log_to_file(
        &state.appdata_dir,
        "app_log.txt",
        &format!("Updated signatory for {}", client),
    );
    Ok(())
}

#[tauri::command]
fn save_history_dr(
    state: tauri::State<'_, AppState>,
    details: HistoryDRDetails,
) -> Result<(), String> {
    if details.ref_number.trim().is_empty() {
        return Err("Reference number is required.".to_string());
    }
    let _guard = state.db_mutex.lock().map_err(|e| e.to_string())?;
    let conn = Connection::open(&state.sqlite_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO HistoryDRDetails (RefNumber, Address, Terms, StoreCode, PONumber, TIN, BusinessStyle, Note, CustomerName)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            details.ref_number.trim(),
            details.address,
            details.terms,
            details.store_code,
            details.po_number,
            details.tin,
            details.business_style,
            details.note,
            details.customer_name
        ],
    )
    .map_err(|e| e.to_string())?;

    log_to_file(
        &state.appdata_dir,
        "app_log.txt",
        &format!("Saved HistoryDRDetails for RefNumber {}", details.ref_number),
    );
    Ok(())
}

fn query_history_dr_sqlite(conn: &Connection, ref_number: &str) -> Option<HistoryDRDetails> {
    conn.query_row(
        "SELECT RefNumber, Address, Terms, StoreCode, PONumber, TIN, BusinessStyle, Note, CustomerName
         FROM HistoryDRDetails WHERE LOWER(RefNumber) = LOWER(?1)",
        params![ref_number],
        |r| {
            Ok(HistoryDRDetails {
                ref_number: r.get(0).unwrap_or_default(),
                address: r.get(1).unwrap_or_default(),
                terms: r.get(2).unwrap_or_default(),
                store_code: r.get(3).unwrap_or_default(),
                po_number: r.get(4).unwrap_or_default(),
                tin: r.get(5).unwrap_or_default(),
                business_style: r.get(6).unwrap_or_default(),
                note: r.get(7).unwrap_or_default(),
                customer_name: r.get(8).unwrap_or_default(),
            })
        },
    )
    .ok()
}

#[tauri::command]
async fn search_document(
    state: tauri::State<'_, AppState>,
    client: String,
    form_type: String,
    ref_number: String,
) -> Result<DocumentSearchResult, String> {
    let ref_trimmed = ref_number.trim().to_string();
    if ref_trimmed.is_empty() {
        return Err("Please enter a reference number.".to_string());
    }

    let appdata_dir = state.appdata_dir.clone();
    let sqlite_path = state.sqlite_path.clone();

    let history_dr = {
        let _guard = state.db_mutex.lock().map_err(|e| e.to_string())?;
        let conn = Connection::open(&sqlite_path).map_err(|e| e.to_string())?;
        query_history_dr_sqlite(&conn, &ref_trimmed)
    };

    log_to_file(
        &appdata_dir,
        "datasync_log.txt",
        &format!(
            "QBSDK Live Query: client={} form={} RefNumber={}",
            client, form_type, ref_trimmed
        ),
    );

    tauri::async_runtime::spawn_blocking(move || {
        let is_transfer_query = client == "NHC" && form_type == "Delivery Receipt";

        let mut invoices: Vec<InvoiceData> = Vec::new();
        let mut transfers: Vec<TransferInventoryData> = Vec::new();

        if is_transfer_query {
            transfers = qbxml::query_transfers_from_qb(&ref_trimmed).map_err(|err| {
                log_to_file(
                    &appdata_dir,
                    "datasync_log.txt",
                    &format!("QBSDK Error for RefNumber {}: {}", ref_trimmed, err),
                );
                format!("QuickBooks SDK Error: {}", err)
            })?;
        } else {
            invoices = qbxml::query_invoices_from_qb(&ref_trimmed, &client).map_err(|err| {
                log_to_file(
                    &appdata_dir,
                    "datasync_log.txt",
                    &format!("QBSDK Error for RefNumber {}: {}", ref_trimmed, err),
                );
                format!("QuickBooks SDK Error: {}", err)
            })?;

            if invoices.is_empty() && client == "MET" {
                invoices = qbxml::query_sales_orders_from_qb(&ref_trimmed).map_err(|err| {
                    log_to_file(
                        &appdata_dir,
                        "datasync_log.txt",
                        &format!("QBSDK SO Error for RefNumber {}: {}", ref_trimmed, err),
                    );
                    format!("QuickBooks SDK Error: {}", err)
                })?;
            }
        }

        let found = if is_transfer_query {
            !transfers.is_empty()
        } else {
            !invoices.is_empty()
        };

        let message = if found {
            format!(
                "Loaded {} (Ref #{}) from live QuickBooks Desktop via QBSDK.",
                form_type, ref_trimmed
            )
        } else {
            format!(
                "No {} found in QuickBooks for reference number '{}'.",
                form_type, ref_trimmed
            )
        };

        log_to_file(&appdata_dir, "datasync_log.txt", &message);

        Ok(DocumentSearchResult {
            found,
            source: "QuickBooks Desktop Live (QBSDK)".to_string(),
            invoices,
            transfers,
            history_dr,
            message,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn reset_qb_permission() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        qbxml::reauthorize_quickbooks()
            .map_err(|e| format!("Reauthorization Error: {}", e))?;
        Ok("If no popup appeared, remove the app manually in QuickBooks → Preferences → Integrated Applications.".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_app_deployment_config(
    state: tauri::State<'_, AppState>,
) -> Result<AppDeploymentConfig, String> {
    let _guard = state.db_mutex.lock().map_err(|e| e.to_string())?;
    let conn = Connection::open(&state.sqlite_path).map_err(|e| e.to_string())?;

    let enabled_json: String = conn
        .query_row(
            "SELECT Value FROM ProgrammerConfig WHERE Key = 'enabled_clients'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| {
            "[\"Enclosure\",\"FP\",\"PBS\",\"NHC\",\"MET\",\"IVP\",\"MEDILIGHT\"]".to_string()
        });

    let mut enabled_clients: Vec<String> = serde_json::from_str(&enabled_json)
        .unwrap_or_else(|_| vec!["Enclosure".to_string()]);

    if enabled_clients.is_empty() {
        enabled_clients.push("Enclosure".to_string());
    }

    let mut default_client: String = conn
        .query_row(
            "SELECT Value FROM ProgrammerConfig WHERE Key = 'default_client'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| enabled_clients[0].clone());

    if !enabled_clients.contains(&default_client) {
        default_client = enabled_clients[0].clone();
    }

    Ok(AppDeploymentConfig {
        enabled_clients,
        default_client,
    })
}

#[tauri::command]
fn verify_programmer_passcode(
    state: tauri::State<'_, AppState>,
    passcode: String,
) -> Result<bool, String> {
    let _guard = state.db_mutex.lock().map_err(|e| e.to_string())?;
    let conn = Connection::open(&state.sqlite_path).map_err(|e| e.to_string())?;

    let saved: String = conn
        .query_row(
            "SELECT Value FROM ProgrammerConfig WHERE Key = 'passcode'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "admin1234".to_string());

    Ok(passcode == saved)
}

#[tauri::command]
fn save_app_deployment_config(
    state: tauri::State<'_, AppState>,
    passcode: String,
    enabled_clients: Vec<String>,
    default_client: String,
    new_passcode: Option<String>,
) -> Result<AppDeploymentConfig, String> {
    if enabled_clients.is_empty() {
        return Err("At least one client must remain enabled.".to_string());
    }

    let _guard = state.db_mutex.lock().map_err(|e| e.to_string())?;
    let conn = Connection::open(&state.sqlite_path).map_err(|e| e.to_string())?;

    let saved_passcode: String = conn
        .query_row(
            "SELECT Value FROM ProgrammerConfig WHERE Key = 'passcode'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "admin1234".to_string());

    if passcode != saved_passcode {
        return Err("Invalid programmer passcode.".to_string());
    }

    let final_default = if enabled_clients.contains(&default_client) {
        default_client
    } else {
        enabled_clients[0].clone()
    };

    let enabled_json = serde_json::to_string(&enabled_clients).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO ProgrammerConfig (Key, Value) VALUES ('enabled_clients', ?1)",
        params![enabled_json],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO ProgrammerConfig (Key, Value) VALUES ('default_client', ?1)",
        params![final_default],
    )
    .map_err(|e| e.to_string())?;

    if let Some(np) = new_passcode {
        let trimmed = np.trim();
        if !trimmed.is_empty() {
            conn.execute(
                "INSERT OR REPLACE INTO ProgrammerConfig (Key, Value) VALUES ('passcode', ?1)",
                params![trimmed],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    log_to_file(
        &state.appdata_dir,
        "app_log.txt",
        &format!(
            "Programmer updated enabled_clients={:?}, default_client={}",
            enabled_clients, final_default
        ),
    );

    Ok(AppDeploymentConfig {
        enabled_clients,
        default_client: final_default,
    })
}

#[tauri::command]
fn get_layout_offsets(
    state: tauri::State<'_, AppState>,
    layout_key: String,
) -> Result<String, String> {
    let _guard = state.db_mutex.lock().map_err(|e| e.to_string())?;
    let conn = Connection::open(&state.sqlite_path).map_err(|e| e.to_string())?;

    let json: String = conn
        .query_row(
            "SELECT OffsetsJson FROM LayoutOffsets WHERE LayoutKey = ?1",
            params![layout_key],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "{}".to_string());

    Ok(json)
}

#[tauri::command]
fn save_layout_offsets(
    state: tauri::State<'_, AppState>,
    layout_key: String,
    offsets_json: String,
) -> Result<(), String> {
    let _guard = state.db_mutex.lock().map_err(|e| e.to_string())?;
    let conn = Connection::open(&state.sqlite_path).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO LayoutOffsets (LayoutKey, OffsetsJson) VALUES (?1, ?2)",
        params![layout_key, offsets_json],
    )
    .map_err(|e| e.to_string())?;

    log_to_file(
        &state.appdata_dir,
        "app_log.txt",
        &format!("Saved layout offsets for {}", layout_key),
    );
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let appdata_dir = resolve_appdata_dir();
    let sqlite_path = appdata_dir.join("qbsi_settings.sqlite");

    if let Ok(conn) = Connection::open(&sqlite_path) {
        let _ = init_sqlite_schema(&conn);
    }

    let app_state = AppState {
        appdata_dir,
        sqlite_path,
        db_mutex: Mutex::new(()),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_client_config,
            update_series_number,
            update_ac_no_and_date,
            update_signatory,
            save_history_dr,
            search_document,
            reset_qb_permission,
            get_app_deployment_config,
            verify_programmer_passcode,
            save_app_deployment_config,
            get_layout_offsets,
            save_layout_offsets,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
