'use strict';
const fs = require('fs');
const bencode = require('bencode');
const dgram = require('dgram');
const Buffer = require('buffer').Buffer;
const urlParse = require('url').parse;

const torrent = bencode.decode(fs.readFileSync('puppy.torrent'));

const url = urlParse(torrent.announce.toString('utf8'));
const socket = dgram.createSocket('udp6');
const myMsg = Buffer.from('Hi', 'utf8');
socket.send(myMsg, 0, myMsg.length, url.port, url.host, () => {
    console.log("message send");
});

socket.on('message', msg => {
  console.log('message is', msg);
});