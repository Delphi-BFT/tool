/* Author: Christian Berger */
const fs = require('fs');
const envGen = require('./generate-env');
let createThemisPeer = (id, ip) => {
  let client_port = 10002 + id*100;
  let peer_port = 10003 + id*100;
  let prometheus_port = 8080 + id;

  let peerString =
  '[[peers]]\n' +
  'id = ' + id + '\n' +
  'host = \'' + ip + '\' \n' +
  'client_port = ' + client_port + '\n' +
  'peer_port = ' + peer_port + '\n' +
  'private_key = ' + '\"keys/ed-25519-private-' + id + '\"\n' +
  'public_key = ' + '\"keys/ed-25519-public-' + id + '\"\n' +
  'prometheus_port = ' + prometheus_port + '\n'+
  '\n';

  return peerString;
};


let createThemisHostConfig = (hosts) => {

  let peers = "";
  for (let i=0; i < hosts; i++) {
    peers += createThemisPeer(i, '127.0.0.1');
  }
  return peers;
};

let createShadowHostConfigForThemis = (hosts) => {

    let hostsString = 'hosts:\n';
    for (let i = 0; i < hosts; i++) {
      hostsString += envGen.createShadowHost(prefix,i, 'target/release/themis-bench-app', '"RUST_LOG=info"', '["'+i+'", "--config", "../../config/default"]', '3s');
    }
    let clientString = envGen.createShadowHost(prefix,hosts, 'target/release/bench-client', '"RUST_LOG=info"', '["-d", "110", "--config", "../../config/default", "--payload", "4000", "-c", "10", "--concurrent", "10"]', '10s')
    return hostsString + clientString;
};

let createConfs = (numberHosts) => {
  let myGraph = envGen.createGraphSimple(numberHosts, '100 Mbit', '100 Mbit', 20, '0.0');
  console.log(myGraph);
  let myThemisConf = createThemisHostConfig(numberHosts);
  console.log(myThemisConf);
  let myShadowConf = createShadowHostConfigForThemis(numberHosts);
  console.log(myShadowConf);

  fs.writeFileSync('myGraph_' + numberHosts + '.gml', myGraph);
  fs.writeFileSync('myThemisConf_' + numberHosts + '.conf', myThemisConf);
  fs.writeFileSync('shadow_host_' + numberHosts +'.conf', myShadowConf);
};
createConfs(16);