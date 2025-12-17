import * as grpcWeb from 'grpc-web';

import * as proto_tunnel_pb from '../proto/tunnel_pb'; // proto import: "proto/tunnel.proto"


export class TunnelServiceClient {
  constructor (hostname: string,
               credentials?: null | { [index: string]: string; },
               options?: null | { [index: string]: any; });

  register(
    request: proto_tunnel_pb.RegistrationRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: proto_tunnel_pb.RegistrationResponse) => void
  ): grpcWeb.ClientReadableStream<proto_tunnel_pb.RegistrationResponse>;

  healthCheck(
    request: proto_tunnel_pb.HealthCheckMsg,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: proto_tunnel_pb.HealthResponseMsg) => void
  ): grpcWeb.ClientReadableStream<proto_tunnel_pb.HealthResponseMsg>;

  sendFrame(
    request: proto_tunnel_pb.SendFrameRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: proto_tunnel_pb.SendFrameResponse) => void
  ): grpcWeb.ClientReadableStream<proto_tunnel_pb.SendFrameResponse>;

  pollFrames(
    request: proto_tunnel_pb.PollRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: proto_tunnel_pb.PollResponse) => void
  ): grpcWeb.ClientReadableStream<proto_tunnel_pb.PollResponse>;

  keepAlive(
    request: proto_tunnel_pb.HealthCheckMsg,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: proto_tunnel_pb.HealthResponseMsg) => void
  ): grpcWeb.ClientReadableStream<proto_tunnel_pb.HealthResponseMsg>;

}

export class TunnelServicePromiseClient {
  constructor (hostname: string,
               credentials?: null | { [index: string]: string; },
               options?: null | { [index: string]: any; });

  register(
    request: proto_tunnel_pb.RegistrationRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<proto_tunnel_pb.RegistrationResponse>;

  healthCheck(
    request: proto_tunnel_pb.HealthCheckMsg,
    metadata?: grpcWeb.Metadata
  ): Promise<proto_tunnel_pb.HealthResponseMsg>;

  sendFrame(
    request: proto_tunnel_pb.SendFrameRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<proto_tunnel_pb.SendFrameResponse>;

  pollFrames(
    request: proto_tunnel_pb.PollRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<proto_tunnel_pb.PollResponse>;

  keepAlive(
    request: proto_tunnel_pb.HealthCheckMsg,
    metadata?: grpcWeb.Metadata
  ): Promise<proto_tunnel_pb.HealthResponseMsg>;

}

