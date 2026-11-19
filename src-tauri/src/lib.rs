use chrono::Local;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct AppState {
    pub appdata_dir: PathBuf,
    pub sqlite_path: PathBuf,
    pub accdb_path: Option<PathBuf>,
    pub bridge_exe_path: Option<PathBuf>,
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

#[derive(Debug, Deserialize)]
struct BridgeJsonOutput {
    pub ok: bool,
    pub error: String,
    pub invoices: Vec<InvoiceData>,
    pub transfers: Vec<TransferInventoryData>,
}

/// Resolves the runtime data directory OUTSIDE `src-tauri/` so `cargo tauri dev`'s file watcher
/// never restarts the app when logs or database files are written.
fn resolve_appdata_dir() -> PathBuf {
    if let Ok(cwd) = std::env::current_dir() {
        // When running under `cargo tauri dev`, current_dir is `<root>/src-tauri`
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
    PathBuf::from("appdata")
}

fn log_to_file(appdata_dir: &Path, file_name: &str, message: &str) {
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let line = format!("{} - {}\n", timestamp, message);
    let log_path = appdata_dir.join(file_name);
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = file.write_all(line.as_bytes());
    }
}

fn locate_file(appdata_dir: &Path, file_name: &str) -> Option<PathBuf> {
    let mut candidates = vec![appdata_dir.join(file_name)];

    if let Ok(cwd) = std::env::current_dir() {
        if let Some(parent) = cwd.parent() {
            candidates.push(parent.join("appdata").join(file_name));
            candidates.push(parent.join(file_name));
        }
        candidates.push(cwd.join(file_name));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidates.push(exe_dir.join(file_name));
        }
    }
    candidates.push(PathBuf::from(format!(
        r"C:\Users\Tetsuro\Desktop\Custom-QBSI\Custom-QBSI\bin\x64\Debug\{}",
        file_name
    )));

    candidates.into_iter().find(|p| p.exists())
}

fn run_powershell(script: &str) -> Result<String, String> {
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", script]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(format!("{} {}", stderr, stdout).trim().to_string())
    }
}

fn run_qbsdk_bridge(
    bridge_exe: &Path,
    action: &str,
    ref_number: &str,
    client: &str,
) -> Result<BridgeJsonOutput, String> {
    let mut cmd = Command::new(bridge_exe);
    cmd.args([action, ref_number, client]);
    if let Some(parent) = bridge_exe.parent() {
        cmd.current_dir(parent);
    }
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute QBSDK bridge: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Empty response from QuickBooks SDK bridge.".to_string()
        } else {
            stderr
        });
    }

    serde_json::from_str::<BridgeJsonOutput>(&stdout)
        .map_err(|e| format!("Invalid JSON from QBSDK bridge: {} (Output: {})", e, stdout))
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
    // Also ensure MEDILIGHT is added to existing default list if all 6 previous defaults were enabled
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

fn import_settings_from_accdb(accdb_path: &Path, sqlite_path: &Path) -> Result<(), String> {
    let accdb_str = accdb_path.to_string_lossy().replace('\'', "''");
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$connStr = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source='{accdb}';Persist Security Info=False;"
$conn = New-Object System.Data.OleDb.OleDbConnection($connStr)
$conn.Open()

function Query-Table($sql) {{
    try {{
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $sql
        $adapter = New-Object System.Data.OleDb.OleDbDataAdapter($cmd)
        $dt = New-Object System.Data.DataTable
        $null = $adapter.Fill($dt)
        $rows = @()
        foreach ($r in $dt.Rows) {{
            $obj = @{{}}
            foreach ($c in $dt.Columns) {{
                $val = $r[$c]
                if ($val -is [System.DBNull]) {{ $obj[$c.ColumnName] = "" }}
                elseif ($val -is [DateTime]) {{ $obj[$c.ColumnName] = $val.ToString("MM/dd/yyyy") }}
                else {{ $obj[$c.ColumnName] = [string]$val }}
            }}
            $rows += $obj
        }}
        return $rows
    }} catch {{
        return @()
    }}
}}

$data = @{{
    seriesEnclosure = Query-Table "SELECT Series FROM [SeriesNumber_Enclosure]"
    seriesFP = Query-Table "SELECT Series FROM [SeriesNumber_FP]"
    seriesPBS = Query-Table "SELECT Series FROM [SeriesNumber_PBS]"
    seriesIVP = Query-Table "SELECT Series FROM [SeriesNumber_IVP]"
    sigEnclosure = Query-Table "SELECT PreparedBy, CheckedBy, ApprovedBy FROM [Signatory_Enclosure] WHERE ID = 1"
    sigFP = Query-Table "SELECT PreparedBy, CheckedBy, ApprovedBy FROM [Signatory_FP] WHERE ID = 1"
    sigPBS = Query-Table "SELECT PreparedBy, CheckedBy, ApprovedBy FROM [Signatory_PBS] WHERE ID = 1"
    sigIVP = Query-Table "SELECT PreparedBy, CheckedBy, ApprovedBy FROM [Signatory_IVP] WHERE ID = 1"
    sigMET = Query-Table "SELECT CashierName FROM [Signatory_MET] WHERE ID = 1"
    sigNHC = Query-Table "SELECT CashierName, Address, Terms, StoreCode, PONo, TINNo FROM [Signatory_NHC] WHERE ID = 1"
    detEnclosure = Query-Table "SELECT TOP 1 ACNO, DateIssued FROM [DetailedEnclosure] ORDER BY ID DESC"
    detFP = Query-Table "SELECT TOP 1 ACNO, DateIssued FROM [DetailedFP] ORDER BY ID DESC"
    detPBS = Query-Table "SELECT TOP 1 ACNO, DateIssued FROM [DetailedPBS] ORDER BY ID DESC"
    detIVP = Query-Table "SELECT TOP 1 ACNO, DateIssued FROM [DetailedIVP] ORDER BY ID DESC"
    historyDR = Query-Table "SELECT RefNumber, Address, Terms, StoreCode, PONumber, TIN, BusinessStyle, Note, CustomerName FROM [HistoryDRDetails]"
}}
$conn.Close()
$data | ConvertTo-Json -Depth 5 -Compress
"#,
        accdb = accdb_str
    );

    let json_str = run_powershell(&script)?;
    let parsed: serde_json::Value = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;

    let mut conn = Connection::open(sqlite_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for (client, key) in [
        ("Enclosure", "seriesEnclosure"),
        ("FP", "seriesFP"),
        ("PBS", "seriesPBS"),
        ("IVP", "seriesIVP"),
    ] {
        if let Some(arr) = parsed.get(key).and_then(|v| v.as_array()) {
            if let Some(first) = arr.first() {
                let s_val = first
                    .get("Series")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim();
                let series_num = s_val.parse::<i32>().unwrap_or(1).max(1);
                let _ = tx.execute(
                    "INSERT OR REPLACE INTO SeriesNumber (Client, Series) VALUES (?1, ?2)",
                    params![client, series_num],
                );
            }
        }
    }

    for (client, key) in [
        ("Enclosure", "sigEnclosure"),
        ("FP", "sigFP"),
        ("PBS", "sigPBS"),
        ("IVP", "sigIVP"),
    ] {
        if let Some(arr) = parsed.get(key).and_then(|v| v.as_array()) {
            if let Some(first) = arr.first() {
                let prep = first.get("PreparedBy").and_then(|v| v.as_str()).unwrap_or("");
                let chk = first.get("CheckedBy").and_then(|v| v.as_str()).unwrap_or("");
                let app = first.get("ApprovedBy").and_then(|v| v.as_str()).unwrap_or("");
                let _ = tx.execute(
                    "UPDATE Signatory SET PreparedBy = ?1, CheckedBy = ?2, ApprovedBy = ?3 WHERE Client = ?4",
                    params![prep, chk, app, client],
                );
            }
        }
    }

    if let Some(arr) = parsed.get("sigMET").and_then(|v| v.as_array()) {
        if let Some(first) = arr.first() {
            let cashier = first.get("CashierName").and_then(|v| v.as_str()).unwrap_or("");
            let _ = tx.execute(
                "UPDATE Signatory SET CashierName = ?1 WHERE Client = 'MET'",
                params![cashier],
            );
        }
    }

    if let Some(arr) = parsed.get("sigNHC").and_then(|v| v.as_array()) {
        if let Some(first) = arr.first() {
            let cashier = first.get("CashierName").and_then(|v| v.as_str()).unwrap_or("");
            let addr = first.get("Address").and_then(|v| v.as_str()).unwrap_or("");
            let terms = first.get("Terms").and_then(|v| v.as_str()).unwrap_or("");
            let sc = first.get("StoreCode").and_then(|v| v.as_str()).unwrap_or("");
            let po = first.get("PONo").and_then(|v| v.as_str()).unwrap_or("");
            let tin = first.get("TINNo").and_then(|v| v.as_str()).unwrap_or("");
            let _ = tx.execute(
                "UPDATE Signatory SET CashierName = ?1, Address = ?2, Terms = ?3, StoreCode = ?4, PONo = ?5, TINNo = ?6 WHERE Client = 'NHC'",
                params![cashier, addr, terms, sc, po, tin],
            );
        }
    }

    for (client, key) in [
        ("Enclosure", "detEnclosure"),
        ("FP", "detFP"),
        ("PBS", "detPBS"),
        ("IVP", "detIVP"),
    ] {
        if let Some(arr) = parsed.get(key).and_then(|v| v.as_array()) {
            if let Some(first) = arr.first() {
                let acno = first.get("ACNO").and_then(|v| v.as_str()).unwrap_or("");
                let di = first.get("DateIssued").and_then(|v| v.as_str()).unwrap_or("");
                let _ = tx.execute("DELETE FROM DetailedPermit WHERE Client = ?1", params![client]);
                let _ = tx.execute(
                    "INSERT INTO DetailedPermit (Client, ACNO, DateIssued) VALUES (?1, ?2, ?3)",
                    params![client, acno, di],
                );
            }
        }
    }

    if let Some(arr) = parsed.get("historyDR").and_then(|v| v.as_array()) {
        for item in arr {
            let ref_num = item.get("RefNumber").and_then(|v| v.as_str()).unwrap_or("");
            if !ref_num.is_empty() {
                let _ = tx.execute(
                    "INSERT OR REPLACE INTO HistoryDRDetails (RefNumber, Address, Terms, StoreCode, PONumber, TIN, BusinessStyle, Note, CustomerName)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    params![
                        ref_num,
                        item.get("Address").and_then(|v| v.as_str()).unwrap_or(""),
                        item.get("Terms").and_then(|v| v.as_str()).unwrap_or(""),
                        item.get("StoreCode").and_then(|v| v.as_str()).unwrap_or(""),
                        item.get("PONumber").and_then(|v| v.as_str()).unwrap_or(""),
                        item.get("TIN").and_then(|v| v.as_str()).unwrap_or(""),
                        item.get("BusinessStyle").and_then(|v| v.as_str()).unwrap_or(""),
                        item.get("Note").and_then(|v| v.as_str()).unwrap_or(""),
                        item.get("CustomerName").and_then(|v| v.as_str()).unwrap_or(""),
                    ],
                );
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
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
        accdb_connected: state.accdb_path.is_some(),
        accdb_path: state
            .accdb_path
            .as_ref()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "SQLite Settings Store".to_string()),
        sqlite_path: state.sqlite_path.to_string_lossy().to_string(),
        qbfc_available: state.bridge_exe_path.is_some(),
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

    if let Some(accdb) = &state.accdb_path {
        if matches!(client.as_str(), "Enclosure" | "FP" | "PBS" | "IVP") {
            let accdb_str = accdb.to_string_lossy().replace('\'', "''");
            let script = format!(
                r#"
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.12.0;Data Source='{accdb}';Persist Security Info=False;")
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = "UPDATE [SeriesNumber_{client}] SET [Series] = ?"
$null = $cmd.Parameters.AddWithValue("?", {series})
$null = $cmd.ExecuteNonQuery()
$conn.Close()
"#,
                accdb = accdb_str,
                client = client,
                series = series_number
            );
            let _ = run_powershell(&script);
        }
    }

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

    if let Some(accdb) = &state.accdb_path {
        if matches!(client.as_str(), "Enclosure" | "FP" | "PBS" | "IVP") {
            let accdb_str = accdb.to_string_lossy().replace('\'', "''");
            let ac_escaped = ac_no.replace('\'', "''");
            let di_escaped = date_issued.replace('\'', "''");
            let script = format!(
                r#"
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.12.0;Data Source='{accdb}';Persist Security Info=False;")
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = "INSERT INTO [Detailed{client}] ([ACNO], [DateIssued]) VALUES (?, ?)"
$null = $cmd.Parameters.AddWithValue("?", '{ac}')
$null = $cmd.Parameters.AddWithValue("?", '{di}')
$null = $cmd.ExecuteNonQuery()
$conn.Close()
"#,
                accdb = accdb_str,
                client = client,
                ac = ac_escaped,
                di = di_escaped
            );
            let _ = run_powershell(&script);
        }
    }

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

    if let Some(accdb) = &state.accdb_path {
        let accdb_str = accdb.to_string_lossy().replace('\'', "''");
        let prep = signatory.prepared_by.replace('\'', "''");
        let chk = signatory.checked_by.replace('\'', "''");
        let app = signatory.approved_by.replace('\'', "''");
        let cash = signatory.cashier_name.replace('\'', "''");

        let sql_part = if matches!(client.as_str(), "MET" | "NHC") {
            format!(
                r#"
$cmd.CommandText = "UPDATE [Signatory_{client}] SET [CashierName] = ? WHERE ID = 1"
$null = $cmd.Parameters.AddWithValue("?", '{cash}')
"#,
                client = client,
                cash = cash
            )
        } else {
            format!(
                r#"
$cmd.CommandText = "UPDATE [Signatory_{client}] SET [PreparedBy] = ?, [CheckedBy] = ?, [ApprovedBy] = ? WHERE ID = 1"
$null = $cmd.Parameters.AddWithValue("?", '{prep}')
$null = $cmd.Parameters.AddWithValue("?", '{chk}')
$null = $cmd.Parameters.AddWithValue("?", '{app}')
"#,
                client = client,
                prep = prep,
                chk = chk,
                app = app
            )
        };

        let script = format!(
            r#"
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.12.0;Data Source='{accdb}';Persist Security Info=False;")
$conn.Open()
$cmd = $conn.CreateCommand()
{sql_part}
$null = $cmd.ExecuteNonQuery()
$conn.Close()
"#,
            accdb = accdb_str,
            sql_part = sql_part
        );
        let _ = run_powershell(&script);
    }

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

    if let Some(accdb) = &state.accdb_path {
        let accdb_str = accdb.to_string_lossy().replace('\'', "''");
        let r = details.ref_number.trim().replace('\'', "''");
        let addr = details.address.replace('\'', "''");
        let terms = details.terms.replace('\'', "''");
        let sc = details.store_code.replace('\'', "''");
        let po = details.po_number.replace('\'', "''");
        let tin = details.tin.replace('\'', "''");
        let bs = details.business_style.replace('\'', "''");
        let note = details.note.replace('\'', "''");
        let cname = details.customer_name.replace('\'', "''");

        let script = format!(
            r#"
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.12.0;Data Source='{accdb}';Persist Security Info=False;")
$conn.Open()
$check = $conn.CreateCommand()
$check.CommandText = "SELECT COUNT(*) FROM [HistoryDRDetails] WHERE [RefNumber] = ?"
$null = $check.Parameters.AddWithValue("?", '{r}')
$count = [int]$check.ExecuteScalar()
$cmd = $conn.CreateCommand()
if ($count -gt 0) {{
    $cmd.CommandText = "UPDATE [HistoryDRDetails] SET [Address]=?, [Terms]=?, [StoreCode]=?, [PONumber]=?, [TIN]=?, [BusinessStyle]=?, [Note]=?, [CustomerName]=? WHERE [RefNumber]=?"
    $null = $cmd.Parameters.AddWithValue("?", '{addr}')
    $null = $cmd.Parameters.AddWithValue("?", '{terms}')
    $null = $cmd.Parameters.AddWithValue("?", '{sc}')
    $null = $cmd.Parameters.AddWithValue("?", '{po}')
    $null = $cmd.Parameters.AddWithValue("?", '{tin}')
    $null = $cmd.Parameters.AddWithValue("?", '{bs}')
    $null = $cmd.Parameters.AddWithValue("?", '{note}')
    $null = $cmd.Parameters.AddWithValue("?", '{cname}')
    $null = $cmd.Parameters.AddWithValue("?", '{r}')
}} else {{
    $cmd.CommandText = "INSERT INTO [HistoryDRDetails] ([RefNumber], [Address], [Terms], [StoreCode], [PONumber], [TIN], [BusinessStyle], [Note], [CustomerName]) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    $null = $cmd.Parameters.AddWithValue("?", '{r}')
    $null = $cmd.Parameters.AddWithValue("?", '{addr}')
    $null = $cmd.Parameters.AddWithValue("?", '{terms}')
    $null = $cmd.Parameters.AddWithValue("?", '{sc}')
    $null = $cmd.Parameters.AddWithValue("?", '{po}')
    $null = $cmd.Parameters.AddWithValue("?", '{tin}')
    $null = $cmd.Parameters.AddWithValue("?", '{bs}')
    $null = $cmd.Parameters.AddWithValue("?", '{note}')
    $null = $cmd.Parameters.AddWithValue("?", '{cname}')
}}
$null = $cmd.ExecuteNonQuery()
$conn.Close()
"#,
            accdb = accdb_str,
            r = r,
            addr = addr,
            terms = terms,
            sc = sc,
            po = po,
            tin = tin,
            bs = bs,
            note = note,
            cname = cname
        );
        let _ = run_powershell(&script);
    }

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
    let bridge_exe = state
        .bridge_exe_path
        .clone()
        .ok_or_else(|| "qbsdk_bridge.exe not found in application folder.".to_string())?;

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
        let action = if client == "NHC" && form_type == "Delivery Receipt" {
            "query_transfer"
        } else if client == "MET" {
            "query_invoice_or_so"
        } else {
            "query_invoice"
        };

        let qb_res = run_qbsdk_bridge(&bridge_exe, action, &ref_trimmed, &client)?;
        if !qb_res.ok {
            log_to_file(
                &appdata_dir,
                "datasync_log.txt",
                &format!("QBSDK Error for RefNumber {}: {}", ref_trimmed, qb_res.error),
            );
            return Err(format!("QuickBooks SDK Error: {}", qb_res.error));
        }

        let found = if action == "query_transfer" {
            !qb_res.transfers.is_empty()
        } else {
            !qb_res.invoices.is_empty()
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
            invoices: qb_res.invoices,
            transfers: qb_res.transfers,
            history_dr,
            message,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn reset_qb_permission(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let bridge_exe = state
        .bridge_exe_path
        .clone()
        .ok_or_else(|| "qbsdk_bridge.exe not found.".to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        let qb_res = run_qbsdk_bridge(&bridge_exe, "reauthorize", "", "IVP")?;
        if !qb_res.ok {
            return Err(format!("Reauthorization Error: {}", qb_res.error));
        }
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
    let accdb_path = locate_file(&appdata_dir, "CustomQBSIDatabase.accdb");
    let bridge_exe_path = locate_file(&appdata_dir, "qbsdk_bridge.exe");

    if let Ok(conn) = Connection::open(&sqlite_path) {
        let _ = init_sqlite_schema(&conn);
    }
    if let Some(ref accdb) = accdb_path {
        let _ = import_settings_from_accdb(accdb, &sqlite_path);
    }

    let app_state = AppState {
        appdata_dir,
        sqlite_path,
        accdb_path,
        bridge_exe_path,
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
