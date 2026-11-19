import { invoke } from "@tauri-apps/api/core";
import {
  AppDeploymentConfig,
  ClientConfigResponse,
  ClientId,
  DocumentSearchResult,
  FormType,
  HistoryDRDetails,
  LayoutOffsetsMap,
  SignatoryData,
} from "../types";

export async function getClientConfig(client: ClientId): Promise<ClientConfigResponse> {
  return await invoke<ClientConfigResponse>("get_client_config", { client });
}

export async function updateSeriesNumber(client: ClientId, seriesNumber: number): Promise<void> {
  await invoke("update_series_number", { client, seriesNumber });
}

export async function updateAcNoAndDate(
  client: ClientId,
  acNo: string,
  dateIssued: string
): Promise<void> {
  await invoke("update_ac_no_and_date", { client, acNo, dateIssued });
}

export async function updateSignatory(client: ClientId, signatory: SignatoryData): Promise<void> {
  await invoke("update_signatory", { client, signatory });
}

export async function saveHistoryDr(details: HistoryDRDetails): Promise<void> {
  await invoke("save_history_dr", { details });
}

export async function searchDocument(
  client: ClientId,
  formType: FormType,
  refNumber: string
): Promise<DocumentSearchResult> {
  return await invoke<DocumentSearchResult>("search_document", {
    client,
    formType,
    refNumber,
  });
}

export async function resetQbPermission(): Promise<string> {
  return await invoke<string>("reset_qb_permission");
}

export async function getAppDeploymentConfig(): Promise<AppDeploymentConfig> {
  return await invoke<AppDeploymentConfig>("get_app_deployment_config");
}

export async function verifyProgrammerPasscode(passcode: string): Promise<boolean> {
  return await invoke<boolean>("verify_programmer_passcode", { passcode });
}

export async function saveAppDeploymentConfig(
  passcode: string,
  enabledClients: ClientId[],
  defaultClient: ClientId,
  newPasscode?: string
): Promise<AppDeploymentConfig> {
  return await invoke<AppDeploymentConfig>("save_app_deployment_config", {
    passcode,
    enabledClients,
    defaultClient,
    newPasscode: newPasscode || null,
  });
}

export async function getLayoutOffsets(layoutKey: string): Promise<LayoutOffsetsMap> {
  try {
    const raw = await invoke<string>("get_layout_offsets", { layoutKey });
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function saveLayoutOffsets(
  layoutKey: string,
  offsets: LayoutOffsetsMap
): Promise<void> {
  await invoke("save_layout_offsets", {
    layoutKey,
    offsetsJson: JSON.stringify(offsets),
  });
}


