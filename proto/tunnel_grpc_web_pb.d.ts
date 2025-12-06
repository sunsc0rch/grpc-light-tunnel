import * as grpcWeb from 'grpc-web';

import * as proto_tunnel_pb from '../proto/tunnel_pb'; // proto import: "proto/tunnel.proto"


export class TunnelServiceClient {
  constructor (hostname: string,
               credentials?: null | { [index: string]: string; },
               options?: null | { [index: string]: any; });

  httpProxy(
    request: proto_tunnel_pb.HttpRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: proto_tunnel_pb.HttpResponse) => void
  ): grpcWeb.ClientReadableStream<proto_tunnel_pb.HttpResponse>;

  register(
    request: proto_tunnel_pb.RegistrationRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: proto_tunnel_pb.RegistrationResponse) => void
  ): grpcWeb.ClientReadableStream<proto_tunnel_pb.RegistrationResponse>;

  checkHealth(
    request: proto_tunnel_pb.HealthCheck,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: proto_tunnel_pb.HealthResponse) => void
  ): grpcWeb.ClientReadableStream<proto_tunnel_pb.HealthResponse>;

  getStats(
    request: proto_tunnel_pb.StatsRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: proto_tunnel_pb.Stats) => void
  ): grpcWeb.ClientReadableStream<proto_tunnel_pb.Stats>;

}

export class TunnelServicePromiseClient {
  constructor (hostname: string,
               credentials?: null | { [index: string]: string; },
               options?: null | { [index: string]: any; });

  httpProxy(
    request: proto_tunnel_pb.HttpRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<proto_tunnel_pb.HttpResponse>;

  register(
    request: proto_tunnel_pb.RegistrationRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<proto_tunnel_pb.RegistrationResponse>;

  checkHealth(
    request: proto_tunnel_pb.HealthCheck,
    metadata?: grpcWeb.Metadata
  ): Promise<proto_tunnel_pb.HealthResponse>;

  getStats(
    request: proto_tunnel_pb.StatsRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<proto_tunnel_pb.Stats>;

}

