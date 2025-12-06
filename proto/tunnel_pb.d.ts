import * as jspb from 'google-protobuf'



export class TunnelFrame extends jspb.Message {
  getFrameId(): string;
  setFrameId(value: string): TunnelFrame;

  getType(): FrameType;
  setType(value: FrameType): TunnelFrame;

  getPayload(): Uint8Array | string;
  getPayload_asU8(): Uint8Array;
  getPayload_asB64(): string;
  setPayload(value: Uint8Array | string): TunnelFrame;

  getObfuscationMethod(): string;
  setObfuscationMethod(value: string): TunnelFrame;

  getMaskType(): string;
  setMaskType(value: string): TunnelFrame;

  getTimestamp(): number;
  setTimestamp(value: number): TunnelFrame;

  getMetadataMap(): jspb.Map<string, string>;
  clearMetadataMap(): TunnelFrame;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): TunnelFrame.AsObject;
  static toObject(includeInstance: boolean, msg: TunnelFrame): TunnelFrame.AsObject;
  static serializeBinaryToWriter(message: TunnelFrame, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): TunnelFrame;
  static deserializeBinaryFromReader(message: TunnelFrame, reader: jspb.BinaryReader): TunnelFrame;
}

export namespace TunnelFrame {
  export type AsObject = {
    frameId: string,
    type: FrameType,
    payload: Uint8Array | string,
    obfuscationMethod: string,
    maskType: string,
    timestamp: number,
    metadataMap: Array<[string, string]>,
  }
}

export class HttpRequest extends jspb.Message {
  getRequestId(): string;
  setRequestId(value: string): HttpRequest;

  getMethod(): string;
  setMethod(value: string): HttpRequest;

  getPath(): string;
  setPath(value: string): HttpRequest;

  getHeadersMap(): jspb.Map<string, string>;
  clearHeadersMap(): HttpRequest;

  getBody(): Uint8Array | string;
  getBody_asU8(): Uint8Array;
  getBody_asB64(): string;
  setBody(value: Uint8Array | string): HttpRequest;

  getQueryMap(): jspb.Map<string, string>;
  clearQueryMap(): HttpRequest;

  getProtocol(): string;
  setProtocol(value: string): HttpRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): HttpRequest.AsObject;
  static toObject(includeInstance: boolean, msg: HttpRequest): HttpRequest.AsObject;
  static serializeBinaryToWriter(message: HttpRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): HttpRequest;
  static deserializeBinaryFromReader(message: HttpRequest, reader: jspb.BinaryReader): HttpRequest;
}

export namespace HttpRequest {
  export type AsObject = {
    requestId: string,
    method: string,
    path: string,
    headersMap: Array<[string, string]>,
    body: Uint8Array | string,
    queryMap: Array<[string, string]>,
    protocol: string,
  }
}

export class HttpResponse extends jspb.Message {
  getRequestId(): string;
  setRequestId(value: string): HttpResponse;

  getStatus(): number;
  setStatus(value: number): HttpResponse;

  getHeadersMap(): jspb.Map<string, string>;
  clearHeadersMap(): HttpResponse;

  getBody(): Uint8Array | string;
  getBody_asU8(): Uint8Array;
  getBody_asB64(): string;
  setBody(value: Uint8Array | string): HttpResponse;

  getResponseTime(): number;
  setResponseTime(value: number): HttpResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): HttpResponse.AsObject;
  static toObject(includeInstance: boolean, msg: HttpResponse): HttpResponse.AsObject;
  static serializeBinaryToWriter(message: HttpResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): HttpResponse;
  static deserializeBinaryFromReader(message: HttpResponse, reader: jspb.BinaryReader): HttpResponse;
}

export namespace HttpResponse {
  export type AsObject = {
    requestId: string,
    status: number,
    headersMap: Array<[string, string]>,
    body: Uint8Array | string,
    responseTime: number,
  }
}

export class RegistrationRequest extends jspb.Message {
  getClientId(): string;
  setClientId(value: string): RegistrationRequest;

  getClientType(): ClientType;
  setClientType(value: ClientType): RegistrationRequest;

  getCapabilitiesList(): Array<string>;
  setCapabilitiesList(value: Array<string>): RegistrationRequest;
  clearCapabilitiesList(): RegistrationRequest;
  addCapabilities(value: string, index?: number): RegistrationRequest;

  getLocalAppUrl(): string;
  setLocalAppUrl(value: string): RegistrationRequest;

  getClientVersion(): string;
  setClientVersion(value: string): RegistrationRequest;

  getClientInfoMap(): jspb.Map<string, string>;
  clearClientInfoMap(): RegistrationRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RegistrationRequest.AsObject;
  static toObject(includeInstance: boolean, msg: RegistrationRequest): RegistrationRequest.AsObject;
  static serializeBinaryToWriter(message: RegistrationRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RegistrationRequest;
  static deserializeBinaryFromReader(message: RegistrationRequest, reader: jspb.BinaryReader): RegistrationRequest;
}

export namespace RegistrationRequest {
  export type AsObject = {
    clientId: string,
    clientType: ClientType,
    capabilitiesList: Array<string>,
    localAppUrl: string,
    clientVersion: string,
    clientInfoMap: Array<[string, string]>,
  }
}

export class RegistrationResponse extends jspb.Message {
  getSuccess(): boolean;
  setSuccess(value: boolean): RegistrationResponse;

  getMessage(): string;
  setMessage(value: string): RegistrationResponse;

  getTunnelId(): string;
  setTunnelId(value: string): RegistrationResponse;

  getServerVersion(): string;
  setServerVersion(value: string): RegistrationResponse;

  getObfuscationMethod(): string;
  setObfuscationMethod(value: string): RegistrationResponse;

  getMaskType(): string;
  setMaskType(value: string): RegistrationResponse;

  getServerTime(): number;
  setServerTime(value: number): RegistrationResponse;

  getConfigMap(): jspb.Map<string, string>;
  clearConfigMap(): RegistrationResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RegistrationResponse.AsObject;
  static toObject(includeInstance: boolean, msg: RegistrationResponse): RegistrationResponse.AsObject;
  static serializeBinaryToWriter(message: RegistrationResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RegistrationResponse;
  static deserializeBinaryFromReader(message: RegistrationResponse, reader: jspb.BinaryReader): RegistrationResponse;
}

export namespace RegistrationResponse {
  export type AsObject = {
    success: boolean,
    message: string,
    tunnelId: string,
    serverVersion: string,
    obfuscationMethod: string,
    maskType: string,
    serverTime: number,
    configMap: Array<[string, string]>,
  }
}

export class HealthCheck extends jspb.Message {
  getCheckId(): string;
  setCheckId(value: string): HealthCheck;

  getTimestamp(): number;
  setTimestamp(value: number): HealthCheck;

  getMetricsMap(): jspb.Map<string, string>;
  clearMetricsMap(): HealthCheck;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): HealthCheck.AsObject;
  static toObject(includeInstance: boolean, msg: HealthCheck): HealthCheck.AsObject;
  static serializeBinaryToWriter(message: HealthCheck, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): HealthCheck;
  static deserializeBinaryFromReader(message: HealthCheck, reader: jspb.BinaryReader): HealthCheck;
}

export namespace HealthCheck {
  export type AsObject = {
    checkId: string,
    timestamp: number,
    metricsMap: Array<[string, string]>,
  }
}

export class HealthResponse extends jspb.Message {
  getCheckId(): string;
  setCheckId(value: string): HealthResponse;

  getHealthy(): boolean;
  setHealthy(value: boolean): HealthResponse;

  getStatus(): string;
  setStatus(value: string): HealthResponse;

  getMetricsMap(): jspb.Map<string, string>;
  clearMetricsMap(): HealthResponse;

  getResponseTime(): number;
  setResponseTime(value: number): HealthResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): HealthResponse.AsObject;
  static toObject(includeInstance: boolean, msg: HealthResponse): HealthResponse.AsObject;
  static serializeBinaryToWriter(message: HealthResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): HealthResponse;
  static deserializeBinaryFromReader(message: HealthResponse, reader: jspb.BinaryReader): HealthResponse;
}

export namespace HealthResponse {
  export type AsObject = {
    checkId: string,
    healthy: boolean,
    status: string,
    metricsMap: Array<[string, string]>,
    responseTime: number,
  }
}

export class ErrorFrame extends jspb.Message {
  getErrorCode(): string;
  setErrorCode(value: string): ErrorFrame;

  getMessage(): string;
  setMessage(value: string): ErrorFrame;

  getDetails(): string;
  setDetails(value: string): ErrorFrame;

  getTimestamp(): number;
  setTimestamp(value: number): ErrorFrame;

  getFrameId(): string;
  setFrameId(value: string): ErrorFrame;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ErrorFrame.AsObject;
  static toObject(includeInstance: boolean, msg: ErrorFrame): ErrorFrame.AsObject;
  static serializeBinaryToWriter(message: ErrorFrame, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ErrorFrame;
  static deserializeBinaryFromReader(message: ErrorFrame, reader: jspb.BinaryReader): ErrorFrame;
}

export namespace ErrorFrame {
  export type AsObject = {
    errorCode: string,
    message: string,
    details: string,
    timestamp: number,
    frameId: string,
  }
}

export class Stats extends jspb.Message {
  getBytesSent(): number;
  setBytesSent(value: number): Stats;

  getBytesReceived(): number;
  setBytesReceived(value: number): Stats;

  getRequestsProcessed(): number;
  setRequestsProcessed(value: number): Stats;

  getActiveConnections(): number;
  setActiveConnections(value: number): Stats;

  getCustomStatsMap(): jspb.Map<string, string>;
  clearCustomStatsMap(): Stats;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Stats.AsObject;
  static toObject(includeInstance: boolean, msg: Stats): Stats.AsObject;
  static serializeBinaryToWriter(message: Stats, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Stats;
  static deserializeBinaryFromReader(message: Stats, reader: jspb.BinaryReader): Stats;
}

export namespace Stats {
  export type AsObject = {
    bytesSent: number,
    bytesReceived: number,
    requestsProcessed: number,
    activeConnections: number,
    customStatsMap: Array<[string, string]>,
  }
}

export class StatsRequest extends jspb.Message {
  getResetCounters(): boolean;
  setResetCounters(value: boolean): StatsRequest;

  getMetricsList(): Array<string>;
  setMetricsList(value: Array<string>): StatsRequest;
  clearMetricsList(): StatsRequest;
  addMetrics(value: string, index?: number): StatsRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): StatsRequest.AsObject;
  static toObject(includeInstance: boolean, msg: StatsRequest): StatsRequest.AsObject;
  static serializeBinaryToWriter(message: StatsRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): StatsRequest;
  static deserializeBinaryFromReader(message: StatsRequest, reader: jspb.BinaryReader): StatsRequest;
}

export namespace StatsRequest {
  export type AsObject = {
    resetCounters: boolean,
    metricsList: Array<string>,
  }
}

export enum FrameType { 
  REGISTER = 0,
  HTTP_REQUEST = 1,
  HTTP_RESPONSE = 2,
  PING = 3,
  PONG = 4,
  DATA = 5,
  ERROR = 6,
  HEARTBEAT = 7,
}
export enum ClientType { 
  LAPTOP = 0,
  BROWSER = 1,
  MOBILE = 2,
}
