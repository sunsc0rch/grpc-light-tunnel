// GENERATED CODE -- DO NOT EDIT!

'use strict';

const grpc = require('@improbable-eng/grpc-web').grpc;

const proto = require('./tunnel_pb.js');

const TunnelService = proto.tunnel.TunnelService;

exports.TunnelService = TunnelService;

/**
 * @param {string} hostname
 * @param {?Object} credentials
 * @param {?Object} options
 * @constructor
 * @struct
 * @final
 */
exports.TunnelServiceClient =
    function(hostname, credentials, options) {
  if (!options) options = {};
  options['format'] = 'text';

  /**
   * @private @const {!grpc.web.GrpcWebClientBase} The client
   */
  this.client_ = new grpc.GrpcWebClientBase(options);

  /**
   * @private @const {string} The hostname
   */
  this.hostname_ = hostname;

  /**
   * @private @const {?Object} The credentials to be used to connect
   */
  this.credentials_ = credentials;

  /**
   * @private @const {?Object} Options for the client
   */
  this.options_ = options;
};


/**
 * @param {!proto.tunnel.TunnelFrame} request The request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @return {!grpc.web.ClientReadableStream<!proto.tunnel.TunnelFrame>}
 *     The XHR Node Readable Stream
 */
exports.TunnelServiceClient.prototype.tunnelStream =
    function(request, metadata) {
  return this.client_.serverStreaming(this.hostname_ +
      '/tunnel.TunnelService/TunnelStream',
      request,
      metadata || {},
      proto.tunnel.TunnelFrame.serializeBinary,
      proto.tunnel.TunnelFrame.deserializeBinary);
};


/**
 * @param {!proto.tunnel.HttpRequest} request The request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @return {!Promise<!proto.tunnel.HttpResponse>}
 *     A native promise that resolves to the response
 */
exports.TunnelServiceClient.prototype.httpProxy =
    function(request, metadata) {
  return this.client_.unaryCall(this.hostname_ +
      '/tunnel.TunnelService/HttpProxy',
      request,
      metadata || {},
      proto.tunnel.HttpRequest.serializeBinary,
      proto.tunnel.HttpResponse.deserializeBinary);
};


/**
 * @param {!proto.tunnel.Registration} request The request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @return {!Promise<!proto.tunnel.RegistrationResponse>}
 *     A native promise that resolves to the response
 */
exports.TunnelServiceClient.prototype.register =
    function(request, metadata) {
  return this.client_.unaryCall(this.hostname_ +
      '/tunnel.TunnelService/Register',
      request,
      metadata || {},
      proto.tunnel.Registration.serializeBinary,
      proto.tunnel.RegistrationResponse.deserializeBinary);
};
