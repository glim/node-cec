'use strict';

const spawn = require('child_process').spawn;
const EventEmitter = require('events').EventEmitter;
const emitLines = require('./lib/emitLines');
const CEC = require('./lib/cectypes');

// ---------------------------------------------------------------------------- #
//    #NodeCEC
// ---------------------------------------------------------------------------- #

class NodeCec extends EventEmitter {

  constructor(cecName=null) {
    this.onClose = this.onClose.bind(this);
    this.processTraffic = this.processTraffic.bind(this);
    this.cecName = cecName;
    this.ready = false;
    this.stdinHandlers = [

      {
        contains: 'waiting for input',
        callback: line => this.emit( 'ready', this )
      },

      {
        match: /^TRAFFIC:/g,
        callback: this.processTraffic
      }

    ];
  }

  start( clientName = 'cec-client', ...params ) {
    this.clientName = clientName;
    this.params = params;
    if (this.cecName != null) {
      this.params.push('-o');
      this.params.push(this.cecName);
    }

    this.client = spawn( this.clientName, this.params );
    emitLines( this.client.stdout );

    this.client.on( 'close', this.onClose );

    return this.client.stdout.on( 'line', line => {

      this.emit( 'data', line );
      return this.processLine( line );
    }

    );
  }

  stop() {
    this.emit( 'stop', this );
    return this.client.kill('SIGINT');
  }

  onClose() {
    return this.emit( 'stop', this );
  }

  send( message ) {
    return this.client.stdin.write( message + '\n' );
  }

  sendCommand( ...command ) {
    command = command.map( hex => hex.toString(16));
    command = command.join( ':' );
    return this.send( `tx ${command}` );
  }

  processLine( line ) {
    this.emit( 'line', line );

    for (let i = 0; i < this.stdinHandlers.length; i++) {

      let handler = this.stdinHandlers[i];
      if (handler.contains != null) {
        if (line.indexOf( handler.contains ) >= 0) {
          handler.callback( line );
        }

      } else if (handler.match != null) {
        let matches = line.match( handler.match );
        if (__guard__(matches, x => x.length) > 0) {
          handler.callback( line );
        }

      } else if (handler.fn != null) {
        if (handler.fn( line )) {
          handler.callback( line );
        }
      }

      return;
    }
  }



  // -------------------------------------------------------------------------- #
  //    #TRAFFIC
  // -------------------------------------------------------------------------- #

  processTraffic( traffic ) {
    let packet = {};

    let command = traffic.substr( traffic.indexOf(']\t') + 2 ); // "<< 0f:..:.."
    command = command.substr( command.indexOf( ' ' ) + 1 ); // "0f:..:.."

    let tokens = command.split(':'); // 0f .. ..

    if (tokens != null) {
      packet.tokens = tokens;
    }

    if (__guard__(tokens, x => x.length) > 0) {
      packet.source = tokens[0][0];
      packet.target = tokens[0][1];
    }

    if (__guard__(tokens, x1 => x1.length) > 1) {
      packet.opcode = parseInt( tokens[1], 16 );
      packet.args = tokens.slice(2, tokens.length + 1).map( hexString => parseInt( hexString, 16 ));
    }

    return this.processPacket( packet );
  }


  processPacket( packet ) {

    // emit raw packet
    this.emit( 'packet', packet );

    // no opcode?
    if (__guard__(packet.tokens, x => x.length) <= 1) {
      this.emit( 'POLLING', packet );
      return;
    }

    switch (packet.opcode) {

      // ---------------------------------------------------------------------- #
      //    #OSD

      case CEC.Opcode.SET_OSD_NAME:
        if (packet.args.length < 1) { break; }
        let osdname = String.fromCharCode.apply( null, packet.args );
        this.emit( 'SET_OSD_NAME', packet, osdname );
        return true;
        break;



      // ---------------------------------------------------------------------- #
      //    #SOURCE / ADDRESS

      case CEC.Opcode.ROUTING_CHANGE: // SOURCE CHANGED
        if (packet.args.length < 4) { break; }
        let from = (packet.args[0] << 8) | packet.args[1];
        let to   = (packet.args[2] << 8) | packet.args[3];
        this.emit( 'ROUTING_CHANGE', packet, from, to );
        return true;
        break;

      case CEC.Opcode.ACTIVE_SOURCE:
        if (packet.args.length < 2) { break; }
        let source   = (packet.args[0] << 8) | packet.args[1];
        this.emit( 'ACTIVE_SOURCE', packet, source );
        return true;
        break;

      case CEC.Opcode.REPORT_PHYSICAL_ADDRESS:
        if (packet.args.length < 2) { break; }
        source = (packet.args[0] << 8) | packet.args[1];
        this.emit( 'REPORT_PHYSICAL_ADDRESS', packet, source, packet.args[2] );
        return true;
        break;



      // ---------------------------------------------------------------------- #
      //    #OTHER

      default:

        let opcodes = CEC.Opcode;
        for (let key in opcodes) {
          let opcode = opcodes[key];
          if (opcode !== packet.opcode) { continue; }
          if (__guard__(key, x1 => x1.length) > 0) { this.emit( key, packet, ...packet.args ); }
          return true;
        }
    }




    // not handled
    return false;
  }
};

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}

module.exports = {
  NodeCec: NodeCec,
  CEC: CEC
}
