import type { RequestPermissionRequest, RequestPermissionResponse } from "@agentclientprotocol/sdk";

export type IPermissionHandler = (
  request: RequestPermissionRequest
) => Promise<RequestPermissionResponse>;
