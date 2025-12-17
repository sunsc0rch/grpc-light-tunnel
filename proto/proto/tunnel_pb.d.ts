import * as jspb from 'google-protobuf'



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
  }
}

export class RegistrationResponse extends jspb.Message {
  getClientId(): string;
  setClientId(value: string): RegistrationResponse;

  getTunnelId(): string;
  setTunnelId(value: string): RegistrationResponse;

  getServerVersion(): string;
  setServerVersion(value: string): RegistrationResponse;

  getSuccess(): boolean;
  setSuccess(value: boolean): RegistrationResponse;

  getMessage(): string;
  setMessage(value: string): RegistrationResponse;

  getTimestamp(): number;
  setTimestamp(value: number): RegistrationResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RegistrationResponse.AsObject;
  static toObject(includeInstance: boolean, msg: RegistrationResponse): RegistrationResponse.AsObject;
  static serializeBinaryToWriter(message: RegistrationResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RegistrationResponse;
  static deserializeBinaryFromReader(message: RegistrationResponse, reader: jspb.BinaryReader): RegistrationResponse;
}

export namespace RegistrationResponse {
  export type AsObject = {
    clientId: string,
    tunnelId: string,
    serverVersion: string,
    success: boolean,
    message: string,
    timestamp: number,
  }
}

export class HttpRequest extends jspb.Message {
  getRequestId(): string;
  setRequestId(value: string): HttpRequest;

  getMethod(): string;
  setMethod(value: string): HttpRequest;

  getPath(): string;
  setPath(value: string): HttpRequest;

  getHeaders(): string;
  setHeaders(value: string): HttpRequest;

  getBody(): Uint8Array | string;
  getBody_asU8(): Uint8Array;
  getBody_asB64(): string;
  setBody(value: Uint8Array | string): HttpRequest;

  getQuery(): string;
  setQuery(value: string): HttpRequest;

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
    headers: string,
    body: Uint8Array | string,
    query: string,
  }
}

export class HttpResponse extends jspb.Message {
  getRequestId(): string;
  setRequestId(value: string): HttpResponse;

  getStatus(): number;
  setStatus(value: number): HttpResponse;

  getHeaders(): string;
  setHeaders(value: string): HttpResponse;

  getBody(): Uint8Array | string;
  getBody_asU8(): Uint8Array;
  getBody_asB64(): string;
  setBody(value: Uint8Array | string): HttpResponse;

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
    headers: string,
    body: Uint8Array | string,
  }
}

export class TunnelFrame extends jspb.Message {
  getFrameId(): string;
  setFrameId(value: string): TunnelFrame;

  getType(): FrameType;
  setType(value: FrameType): TunnelFrame;

  getPayload(): Uint8Array | string;
  getPayload_asU8(): Uint8Array;
  getPayload_asB64(): string;
  setPayload(value: Uint8Array | string): TunnelFrame;

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
    timestamp: number,
    metadataMap: Array<[string, string]>,
  }
}

export class HealthCheckMsg extends jspb.Message {
  getService(): string;
  setService(value: string): HealthCheckMsg;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): HealthCheckMsg.AsObject;
  static toObject(includeInstance: boolean, msg: HealthCheckMsg): HealthCheckMsg.AsObject;
  static serializeBinaryToWriter(message: HealthCheckMsg, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): HealthCheckMsg;
  static deserializeBinaryFromReader(message: HealthCheckMsg, reader: jspb.BinaryReader): HealthCheckMsg;
}

export namespace HealthCheckMsg {
  export type AsObject = {
    service: string,
  }
}

export class HealthResponseMsg extends jspb.Message {
  getStatus(): string;
  setStatus(value: string): HealthResponseMsg;

  getTimestamp(): number;
  setTimestamp(value: number): HealthResponseMsg;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): HealthResponseMsg.AsObject;
  static toObject(includeInstance: boolean, msg: HealthResponseMsg): HealthResponseMsg.AsObject;
  static serializeBinaryToWriter(message: HealthResponseMsg, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): HealthResponseMsg;
  static deserializeBinaryFromReader(message: HealthResponseMsg, reader: jspb.BinaryReader): HealthResponseMsg;
}

export namespace HealthResponseMsg {
  export type AsObject = {
    status: string,
    timestamp: number,
  }
}

export class PollRequest extends jspb.Message {
  getClientId(): string;
  setClientId(value: string): PollRequest;

  getTunnelId(): string;
  setTunnelId(value: string): PollRequest;

  getLastFrameId(): string;
  setLastFrameId(value: string): PollRequest;

  getTimeoutMs(): number;
  setTimeoutMs(value: number): PollRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PollRequest.AsObject;
  static toObject(includeInstance: boolean, msg: PollRequest): PollRequest.AsObject;
  static serializeBinaryToWriter(message: PollRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): PollRequest;
  static deserializeBinaryFromReader(message: PollRequest, reader: jspb.BinaryReader): PollRequest;
}

export namespace PollRequest {
  export type AsObject = {
    clientId: string,
    tunnelId: string,
    lastFrameId: string,
    timeoutMs: number,
  }
}

export class PollResponse extends jspb.Message {
  getFramesList(): Array<TunnelFrame>;
  setFramesList(value: Array<TunnelFrame>): PollResponse;
  clearFramesList(): PollResponse;
  addFrames(value?: TunnelFrame, index?: number): TunnelFrame;

  getHasMore(): boolean;
  setHasMore(value: boolean): PollResponse;

  getNextPollIn(): string;
  setNextPollIn(value: string): PollResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PollResponse.AsObject;
  static toObject(includeInstance: boolean, msg: PollResponse): PollResponse.AsObject;
  static serializeBinaryToWriter(message: PollResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): PollResponse;
  static deserializeBinaryFromReader(message: PollResponse, reader: jspb.BinaryReader): PollResponse;
}

export namespace PollResponse {
  export type AsObject = {
    framesList: Array<TunnelFrame.AsObject>,
    hasMore: boolean,
    nextPollIn: string,
  }
}

export class SendFrameRequest extends jspb.Message {
  getFrame(): TunnelFrame | undefined;
  setFrame(value?: TunnelFrame): SendFrameRequest;
  hasFrame(): boolean;
  clearFrame(): SendFrameRequest;

  getClientId(): string;
  setClientId(value: string): SendFrameRequest;

  getTunnelId(): string;
  setTunnelId(value: string): SendFrameRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): SendFrameRequest.AsObject;
  static toObject(includeInstance: boolean, msg: SendFrameRequest): SendFrameRequest.AsObject;
  static serializeBinaryToWriter(message: SendFrameRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): SendFrameRequest;
  static deserializeBinaryFromReader(message: SendFrameRequest, reader: jspb.BinaryReader): SendFrameRequest;
}

export namespace SendFrameRequest {
  export type AsObject = {
    frame?: TunnelFrame.AsObject,
    clientId: string,
    tunnelId: string,
  }
}

export class SendFrameResponse extends jspb.Message {
  getSuccess(): boolean;
  setSuccess(value: boolean): SendFrameResponse;

  getMessage(): string;
  setMessage(value: string): SendFrameResponse;

  getTimestamp(): number;
  setTimestamp(value: number): SendFrameResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): SendFrameResponse.AsObject;
  static toObject(includeInstance: boolean, msg: SendFrameResponse): SendFrameResponse.AsObject;
  static serializeBinaryToWriter(message: SendFrameResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): SendFrameResponse;
  static deserializeBinaryFromReader(message: SendFrameResponse, reader: jspb.BinaryReader): SendFrameResponse;
}

export namespace SendFrameResponse {
  export type AsObject = {
    success: boolean,
    message: string,
    timestamp: number,
  }
}

export enum ClientType { 
  UNKNOWN = 0,
  LAPTOP = 1,
  BROWSER = 2,
}
export enum FrameType { 
  UNKNOWN_FRAME = 0,
  HTTP_REQUEST = 1,
  HTTP_RESPONSE = 2,
  PING = 3,
  PONG = 4,
  DATA = 5,
}
