'use strict';

const fs = require('fs');
const bencode = require('bencode');
const dgram = require('dgram');
const net = require('net')
const Buffer = require('buffer').Buffer;
const urlParse = require('url').parse;
const crypto = require("crypto");
// const {Uint64BE} = require("int64-buffer");

// const connection_Id = new Uint64BE(0x41727101980);
const torrent = bencode.decode(fs.readFileSync(process.argv.splice(2).join(' ')));
const torrent0 = bencode.decode(fs.readFileSync('puppy.torrent'));
const torrent1 = bencode.decode(fs.readFileSync('Avengers Endgame (2019) [720p] [WEBRip] [YTS.MX].torrent'));
const torrent2 = bencode.decode(fs.readFileSync('Microsoft Windows 11 build 21996.1 x64 and Activator.torrent'));
const torrent3 = bencode.decode(fs.readFileSync('GTA V - Grand Theft Auto V.torrent'));
const torrent4 = bencode.decode(fs.readFileSync('Forbidden Knowledge - 101 Things No One Should Know How to Do.torrent'));


async function getPeers(torrent, udpTYPE="udp4") {
  for(let i = -1 ; i<0 || torrent["announce-list"][i] ; i++){

    //all tracker url won't be online
    const url = (i<0) ? urlParse(torrent.announce.toString('utf8')) : torrent["announce-list"][i].toString('utf8');
    const socket = dgram.createSocket(udpTYPE);

    await udpSend(socket, buildConnReq(), url);
    const Resp = await announceResp(socket, url);
    if (Resp) return Resp.peers;
    if ((i == torrent["announce-list"].length - 1) && ( udpTYPE == "udp4")) { i = -2; udpTYPE = "udp6"; }
  }
  throw new Error("your torrent is dead");
}


function infoHash(torrent) {
  const info = bencode.encode(torrent.info);
  return crypto.createHash('sha1').update(info).digest();
};

function torrentSize(torrent) {
  const buf = Buffer.alloc(8);
  const size = BigInt(torrent.info.files ?
    torrent.info.files.map(file => file.length).reduce((a, b) => a + b) :
    torrent.info.length);
  buf.writeBigInt64BE(size, 0);
  return buf;
}




function udpSend(socket, message, rawUrl) {
  const url = urlParse(rawUrl);
  return new Promise(resolve =>{
    socket.send(message, 0, message.length, url.port, url.hostname, () => {
      resolve();
    });
  })
}

function announceResp(socket, url){
  return new Promise(resolve => {
    socket.on("message", response => {
      //0 : connect; if 1 : announce
      if (response.readUInt32BE(0) === 0){
        const connResp = parseConnResp(response);
        const announceReq = buildAnnounceReq(connResp.connectionId,torrent);
        udpSend(socket, announceReq, url);
      }else if (response.readUInt32BE(0) === 1) {
        const announceResp = parseAnnounceResp(response);
        resolve(announceResp);
      }
    })
    setTimeout(() => {resolve();}, 2000);
  });
}


function buildConnReq() {

      /*Offset  Size            Name            Value
        0       64-bit integer  connection_id   0x41727101980
        8       32-bit integer  action          0 // connect
        12      32-bit integer  transaction_id  ? // random
        16*/


  const buf = Buffer.allocUnsafe(16);

  // connection_Id
  buf.writeBigUInt64BE(0x41727101980n, 0);
  // action
  buf.writeUInt32BE(0, 8);
  // to create random transaction peerId
  crypto.randomBytes(4).copy(buf, 12);

  return buf;
}

function parseConnResp(resp) {

      /*Offset  Size            Name            Value
        0       32-bit integer  action          0 // connect
        4       32-bit integer  transaction_id
        8       64-bit integer  connection_id
        16*/


  return {
    action: resp.readUInt32BE(0),
    transactionId: resp.readUInt32BE(4),
    connectionId: resp.slice(8)
  }
}

function buildAnnounceReq(connId, torrent, port=6881) {

  /*Offset  Size    Name    Value
    0       64-bit integer  connection_id
    8       32-bit integer  action          1 // announce
    12      32-bit integer  transaction_id
    16      20-byte string  info_hash
    36      20-byte string  peer_id
    56      64-bit integer  downloaded
    64      64-bit integer  left
    72      64-bit integer  uploaded
    80      32-bit integer  event           0 // 0: none; 1: completed; 2: started; 3: stopped
    84      32-bit integer  IP address      0 // default
    88      32-bit integer  key             ? // random
    92      32-bit integer  num_want        -1 // default
    96      16-bit integer  port            ? // should be betwee
    98*/


  const buf = Buffer.allocUnsafe(98);

  // connection id
  connId.copy(buf, 0);
  // action
  buf.writeUInt32BE(1, 8);
  // transaction id
  crypto.randomBytes(4).copy(buf, 12);
  // info hash
  infoHash(torrent).copy(buf, 16);
  // peerId
  const peerId = crypto.randomBytes(20);
  Buffer.from('-AT0001-').copy(peerId, 0);  
  peerId.copy(buf, 36);
  // downloaded
  Buffer.alloc(8).copy(buf, 56);
  // left
  torrentSize(torrent).copy(buf, 64);
  // uploaded
  Buffer.alloc(8).copy(buf, 72);
  // event
  buf.writeUInt32BE(0, 80);
  // ip address
  buf.writeUInt32BE(0, 80);
  // key
  crypto.randomBytes(4).copy(buf, 88);
  // num want
  buf.writeInt32BE(-1, 92);
  // port
  buf.writeUInt16BE(port, 96);

  return buf;
}

function parseAnnounceResp(resp) {

  /* Offset      Size            Name            Value
    0           32-bit integer  action          1 // announce
    4           32-bit integer  transaction_id
    8           32-bit integer  interval
    12          32-bit integer  leechers
    16          32-bit integer  seeders
    20 + 6 * n  32-bit integer  IP address
    24 + 6 * n  16-bit integer  TCP port
    20 + 6 * N */

  
  function group(iterable, groupSize) {
    let groups = [];
    for (let i = 0; i < iterable.length; i += groupSize) {
      groups.push(iterable.slice(i, i + groupSize));
    }
    return groups;
  }
  return {
    action: resp.readUInt32BE(0),
    transactionId: resp.readUInt32BE(4),
    leechers: resp.readUInt32BE(8),
    seeders: resp.readUInt32BE(12),
    peers: group(resp.slice(20), 6).map(address => {
      return {
        ip: address.slice(0, 4).join('.'),
        port: address.readUInt16BE(4)
      }
    })
  }    
}

 getPeers(torrent)
  .then( peers => console.log(peers))
  .catch( err => console.error(err));


function download(peer) {
  const socket = net.Socket();
  socket.on('error', console.error);
  socket.connect(peer.port, peer.ip, () => {
    // socket.write(...) write a message here
  });
  onWholeMsg(socket, data => {
    // handle response here
  });
}

function onWholeMsg(socket, callback) {
  let savedBuf = Buffer.alloc(0);
  let handshake = true;

  socket.on('data', recvBuf => {
    // msgLen calculates the length of a whole message
    const msgLen = () => handshake ? savedBuf.readUInt8(0) + 49 : savedBuf.readInt32BE(0) + 4;
    savedBuf = Buffer.concat([savedBuf, recvBuf]);

    while (savedBuf.length >= 4 && savedBuf.length >= msgLen()) {
      callback(savedBuf.slice(0, msgLen()));
      savedBuf = savedBuf.slice(msgLen());
      handshake = false;
    }
  });
}
  
function buildHandshake(torrent){

        // handshake: <pstrlen><pstr><reserved><info_hash><peer_id>
        // offset   : 0        1     20        28         48       68

  const buf = Buffer.alloc(68);
  // pstrlen
  buf.writeUInt8(19, 0);
  // pstr
  buf.write('BitTorrent protocol', 1);
  // reserved
  buf.writeUInt32BE(0, 20);
  buf.writeUInt32BE(0, 24);
  // info hash
  infoHash(torrent).copy(buf, 28);
  // peer id
  const peerId = crypto.randomBytes(20);
  Buffer.from('-TC0120-').copy(peerId, 0);  
  peerId.copy(buf, 48);

  return buf;
};

function buildKeepAlive() {
  
      // keep-alive: <len=0000>
      // offset    : 0         4

  const buf = Buffer.alloc(4);

  return buf;
}

function buildChoke() {

      // choke : <len=0001><id=0>
      // offSet: 0         4     5

  const buf = Buffer.alloc(5);
  // length
  buf.writeUInt32BE(1, 0);
  // id
  buf.writeUInt8(0, 4);

  return buf;
}

function buildUnchoke() {

      // choke : <len=0001><id=1>
      // offSet: 0         4     5

  const buf = Buffer.alloc(5);
  // length
  buf.writeUInt32BE(1, 0);
  // id
  buf.writeUInt8(1, 4);

  return buf;
}

function buildIntrested() {

      // choke : <len=0001><id=2>
      // offSet: 0         4     5

  const buf = Buffer.alloc(5);
  // length
  buf.writeUInt32BE(1, 0);
  // id
  buf.writeUInt8(2, 4);

  return buf;
}

function buildUnintrested() {

      // choke : <len=0001><id=3>
      // offSet: 0         4     5

  const buf = Buffer.alloc(5);
  // length
  buf.writeUInt32BE(1, 0);
  // id
  buf.writeUInt8(3, 4);

  return buf;
}

function buildHave(payload) {
  
      // have  : <len=0005><id=4><piece index>
      // offSet: 0         4     5            9

  const buf = Buffer.alloc(9);
  // length
  buf.writeUInt32BE(5, 0);
  // id
  buf.writeUInt8(4, 4);
  // piece index
  buf.writeUInt32BE(payload, 5);
  return buf;
};

function buildBitfield(bitfield, payload) {

      //bitfield: <len=0001+X><id=5><bitfield>
      //offset  : 0           4     5         14 
  const buf = Buffer.alloc(14);
  // length
  buf.writeUInt32BE(payload.length + 1, 0);
  // id
  buf.writeUInt8(5, 4);
  // bitfield
  bitfield.copy(buf, 5);
  return buf;
};

function buildRequest(payload) {

      //request : <len=0013><id=6><index><begin><length>
      //offset  : 0         4     5      9      13      17

  const buf = Buffer.alloc(17);
  // length
  buf.writeUInt32BE(13, 0);
  // id
  buf.writeUInt8(6, 4);
  // piece index
  buf.writeUInt32BE(payload.index, 5);
  // begin
  buf.writeUInt32BE(payload.begin, 9);
  // length
  buf.writeUInt32BE(payload.length, 13);
  return buf;
};

function buildPiece (payload) {

      //piece  : <len=0009+x><id=8><index><begin><length>
      //offset : 0           4     5      9      13      x + 13

  const buf = Buffer.alloc(payload.block.length + 13);
  // length
  buf.writeUInt32BE(payload.block.length + 9, 0);
  // id
  buf.writeUInt8(7, 4);
  // piece index
  buf.writeUInt32BE(payload.index, 5);
  // begin
  buf.writeUInt32BE(payload.begin, 9);
  // block
  payload.block.copy(buf, 13);
  return buf;
};

function buildCancel(payload) {

      //cancel : <len=0013><id=8><index><begin><length>
      //offset : 0         4     5      9      13      17

  const buf = Buffer.alloc(17);
  // length
  buf.writeUInt32BE(13, 0);
  // id
  buf.writeUInt8(8, 4);
  // piece index
  buf.writeUInt32BE(payload.index, 5);
  // begin
  buf.writeUInt32BE(payload.begin, 9);
  // length
  buf.writeUInt32BE(payload.length, 13);
  return buf;
};

function buildPort (payload) {

      // port : <len=0003><id=9><listen-port>
      //offset: 0         4     5            7

  const buf = Buffer.alloc(7);
  // length
  buf.writeUInt32BE(3, 0);
  // id
  buf.writeUInt8(9, 4);
  // listen-port
  buf.writeUInt16BE(payload, 5);
  return buf;
};