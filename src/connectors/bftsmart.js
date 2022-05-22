const fs = require('fs');
const { promisified_spawn } = require('../util/exec');
const path = require('path');
const ipUtil = require('../util/ipUtil');

/* BFT-SMaRt settings*/
const buildDir = 'build/install/library';
const sysconfFile = path.join(buildDir, '/config/system.config');
const hostsFile = path.join(buildDir, '/config/hosts.config');
const viewFile = path.join(buildDir, '/config/currentView');
const bftSmartPort = 11000;
const bftSmartPort1 = 11001;
const sysconf = {
  'system.communication.secretKeyAlgorithm': 'PBKDF2WithHmacSHA1',
  'system.communication.secretKeyAlgorithmProvider': 'SunJCE',
  'system.communication.hashAlgorithm': 'SHA-256',
  'system.communication.hashAlgorithmProvider': 'SUN',
  'system.communication.signatureAlgorithm': 'SHA256withECDSA',
  'system.communication.signatureAlgorithmProvider': 'BC',
  'system.communication.defaultKeyLoader': 'ECDSA',
  'system.communication.useSenderThread': 'true',
  'system.communication.defaultkeys': 'true',
  'system.communication.bindaddress': 'auto',
  'system.totalordermulticast.timeout': '2000',
  'system.totalordermulticast.batchtimeout': '-1',
  'system.totalordermulticast.fairbatch': 'false',
  'system.totalordermulticast.nonces': '10',
  'system.totalordermulticast.verifyTimestamps': 'false',
  'system.communication.inQueueSize': '500000',
  'system.communication.outQueueSize': '500000',
  'system.communication.useSignatures': '0',
  'system.shutdownhook': 'true',
  'system.samebatchsize': 'false',
  'system.numrepliers': '16',
  'system.totalordermulticast.state_transfer': 'true',
  'system.totalordermulticast.highMark': '10000',
  'system.totalordermulticast.revival_highMark': '10',
  'system.totalordermulticast.timeout_highMark': '200',
  'system.totalordermulticast.log': 'true',
  'system.totalordermulticast.log_parallel': 'false',
  'system.totalordermulticast.log_to_disk': 'false',
  'system.totalordermulticast.sync_log': 'false',
  'system.totalordermulticast.checkpoint_period': '1024',
  'system.totalordermulticast.global_checkpoint_period': '120000',
  'system.totalordermulticast.checkpoint_to_disk': 'false',
  'system.totalordermulticast.sync_ckp': 'false',
  'system.ttp.id': '7002',
  'system.bft': 'true',
  'system.ssltls.protocol_version': 'TLSv1.2',
  'system.ssltls.key_store_file': 'EC_KeyPair_256.pkcs12',
  'system.ssltls.enabled_ciphers': 'TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256',
  'system.client.invokeOrderedTimeout': '40',
};

const throughputLatencyServerClass =
  'bftsmart.demo.microbenchmarks.ThroughputLatencyServer';
const throughputLatencyClientClass =
  'bftsmart.demo.microbenchmarks.ThroughputLatencyClient';

/* Java stuff */

const javaProc = '/usr/bin/java';
const javaArgs =
  '-Djava.security.properties=config/java.security -Dlogback.configurationFile=config/logback.xml -cp lib/*';

async function build(workingDir, replicaSettings, clientSettings, log) {
  log.info('building BFT-SMaRt ...');
  let cmd = { proc: './gradlew', args: ['installDist'] };
  await promisified_spawn(cmd.proc, cmd.args, workingDir, log);
  log.info('BFT-SMaRt build terminated sucessfully!');
}
async function genSystemConfig(workingDir, replicas, batchsize) {
  let viewString = '';

  for (let i = 0; i < replicas; i++)
    viewString += i + (i < replicas - 1 ? ',' : '');
  sysconf['system.initial.view'] = viewString;
  sysconf['system.servers.num'] = replicas;
  sysconf['system.servers.f'] = Math.floor((replicas - 1) / 3);
  sysconf['system.totalordermulticast.maxbatchsize'] = batchsize;
  let sysconfString = '';

  for (const [key, value] of Object.entries(sysconf)) {
    sysconfString += key + ' = ' + value + '\n';
  }

  fs.writeFileSync(path.join(workingDir, sysconfFile), sysconfString);
}
async function genHostsConfig(workingDir, replicas) {
  let replicaIPs = await ipUtil.getIPs({ bftsmartReplica: replicas });
  let hostsString = '';
  for (let i = 0; i < replicaIPs.length; i++) {
    hostsString += `${i} ${replicaIPs[i].ip} ${bftSmartPort} ${bftSmartPort1}\n`;
  }
  hostsString += `7000 12.0.0.1 11100\n`;
  fs.writeFileSync(path.join(workingDir, hostsFile), hostsString);
  return replicaIPs;
}
async function passArgs(replicaIPs, replicaSettings, clientSettings) {
  for (let i = 0; i < replicaIPs.length; i++) {
    replicaIPs[i].proc = javaProc;
    replicaIPs[i].env = '';
    replicaIPs[
      i
    ].args = `${javaArgs} ${throughputLatencyServerClass} ${i} ${replicaSettings.replicaInterval} ${replicaSettings.replySize} ${replicaSettings.stateSize} ${replicaSettings.context} ${replicaSettings.replicaSig}`;
    replicaIPs[i].isClient = false;
  }
  /* add in client */
  replicaIPs.push({
    name: 'client',
    ip: '12.0.0.1',
    proc: javaProc,
    env: '',
    args: `${javaArgs} ${throughputLatencyClientClass} 7000 ${clientSettings.clients} ${clientSettings.opPerClient} ${clientSettings.reqSize} ${clientSettings.clientInterval} ${clientSettings.readOnly} ${clientSettings.verbose} ${clientSettings.clientSig}`,
    isClient: true,
  });
  return replicaIPs;
}
async function deleteCurrentView(workingDir) {
  try {
    fs.unlinkSync(path.join(workingDir, viewFile));
  } catch (err) {
    console.error(err);
  }
}
async function configure(workingDir, replicaSettings, clientSettings, log) {
  log.info('deleting old view');
  await deleteCurrentView(workingDir);
  log.info('reading experiment details ...');
  //let experimentId = Object.keys(experiment)[0];
  /* Replica Settings */
  /* let replicaSettings = {
    replicas: experiment[experimentId].replica.replicas,
    blockSize: experiment[experimentId].replica.blocksize,
    replicaInterval: experiment[experimentId].replica.replicaInterval,
    replySize: experiment[experimentId].replica.replysize,
    stateSize: experiment[experimentId].replica.statesize,
    context: experiment[experimentId].replica.context,
    replicaSig: experiment[experimentId].replica.replicaSig,
  };*/
  /* Client Settings */
  /*let clientSettings = {
    clients: experiment[experimentId].client.clients,
    opPerClient: experiment[experimentId].client.opPerClient,
    reqSize: experiment[experimentId].client.requestsize,
    clientInterval: experiment[experimentId].client.clientInterval,
    readOnly: experiment[experimentId].client.readOnly,
    verbose: experiment[experimentId].client.verbose,
    clientSig: experiment[experimentId].client.clientSig,
  };*/
  log.info('generating system.config ...');
  await genSystemConfig(
    workingDir,
    replicaSettings.replicas,
    replicaSettings.blockSize,
  );
  log.info('system.config generated!');
  log.info('generating hosts.config ...');
  var replicaIPs = await genHostsConfig(workingDir, replicaSettings.replicas);
  log.info('hosts.config generated!');
  replicaIPs = await passArgs(replicaIPs, replicaSettings, clientSettings);
  return replicaIPs;
}
module.exports = { build, configure };
