'use strict';
const fs = require('fs');
const bencode = require('bencode');
const dgram = require('dgram');
const Buffer = require('buffer').Buffer;
const urlParse = require('url').parse;
const crypto = require("crypto");
const {Uint64BE} = require("int64-buffer");

const connection_Id = new Uint64BE(0x41727101980);
const torrent = bencode.decode(fs.readFileSync('puppy.torrent'));
const torrent1 = bencode.decode(fs.readFileSync('Avengers Endgame (2019) [720p] [WEBRip] [YTS.MX].torrent'));
const torrent2 = bencode.decode(fs.readFileSync('Microsoft Windows 11 build 21996.1 x64 + Activator.torrent'));
const torrent3 = bencode.decode(fs.readFileSync('GTA V - Grand Theft Auto V.torrent'));


async function getPeers (torrent) {
  var url = urlParse(torrent.announce.toString('utf8'));
  var socket;
  
  var dummy = false;

  for(let i = -1 ; i<0 || torrent["announce-list"][i] ; i++){
    // console.log(i);
    socket = dgram.createSocket('udp4');
    url = (i<0) ? url : torrent["announce-list"][i].toString('utf8');

    await udpSend(socket, buildConnReq(), url);
    await new Promise((resolve,reject) => {
      socket.on("message", response => {
        //0 : connect; if 1 : announce
        // console.log(response);
        if (response.readUInt32BE(0) === 0){
          const connResp = parseConnResp(response);
          const announceReq = buildAnnounceReq(connResp.connectionId,torrent);
          udpSend(socket, announceReq, url);
        }else if (response.readUInt32BE(0) === 1) {
          const announceResp = parseAnnounceResp(response);
          console.log(announceResp.peers);
          dummy = true;
          resolve()
        }
      })
      setTimeout(() => {resolve();}, 2000);
    });
    if(dummy) break;
  }
}



function infoHash (torrent) {
  const info = bencode.encode(torrent.info);
  return crypto.createHash('sha1').update(info).digest();
};

function torrentSize (torrent) {
  let size;
  if (torrent.info.files) {
    size = new Uint64BE(torrent.info.files.map(file => file.length).reduce((a, b) => a + b));
  }else{
    size = new Uint64BE(torrent.info.length);
  }
  return size.toBuffer();
}




function udpSend(socket, message, rawUrl) {
  const url = urlParse(rawUrl);
  return new Promise(resolve =>{
    socket.send(message, 0, message.length, url.port, url.hostname, () => {
    });
    resolve();
  })
}


function buildConnReq() {

      /*Offset  Size            Name            Value
        0       64-bit integer  connection_id   0x41727101980
        8       32-bit integer  action          0 // connect
        12      32-bit integer  transaction_id  ? // random
        16*/


  const buf = Buffer.allocUnsafe(16);

  // connection_Id
  connection_Id.toBuffer().copy(buf, 0);
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

getPeers(torrent3);