const fs = require('fs')
const { promisified_spawn } = require('../util/exec')
const path = require('path')
const ipUtil = require('../util/ip-util')
const { isNullOrEmpty } = require('../util/helpers')
const { isBoolean } = require('mathjs')

/* BFT-SMaRt settings*/
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
}

const processName = 'java'

/* Java stuff */

const javaProc = '/usr/bin/java'

function _parse(replicaSettings, clientSettings) {
  if (isNullOrEmpty(replicaSettings))
    throw new Error('replica object of current experiment was not defined')
  if (isNullOrEmpty(clientSettings))
    throw new Error('client object of current experiment was not defined')
  if (isNullOrEmpty(replicaSettings.replicas))
    throw new Error(
      'replicas property of replicas object of current experiment was not defined',
    )
  if (!Number.isInteger(replicaSettings.replicas))
    throw new Error('replicas property of replica object must be an Integer')
  if (isNullOrEmpty(replicaSettings.blockSize))
    throw new Error(
      'blockSize property of replica object of current experiment was not defined',
    )
  if (!Number.isInteger(replicaSettings.blockSize))
    throw new Error('blockSize property of replica object must be an Integer')
  if (isNullOrEmpty(replicaSettings.replicaInterval))
    throw new Error(
      'replicaInterval property of replica object of current experiment was not defined',
    )
  if (!Number.isInteger(replicaSettings.replicaInterval))
    throw new Error(
      'replicaInterval property of replica object must be an Integer',
    )
  if (isNullOrEmpty(replicaSettings.replySize))
    throw new Error(
      'replySize property of replica object of current experiment was not defined',
    )
  if (!Number.isInteger(replicaSettings.replySize))
    throw new Error('replySize property of replica object must be an Integer')
  if (isNullOrEmpty(replicaSettings.stateSize))
    throw new Error(
      'stateSize property of replica object of current experiment was not defined',
    )
  if (!Number.isInteger(replicaSettings.stateSize))
    throw new Error('stateSize property of replica object must be an Integer')
  if (isNullOrEmpty(replicaSettings.context))
    throw new Error(
      'context property of replica object of current experiment was not defined',
    )
  if (!isBoolean(replicaSettings.context))
    throw new Error(
      'context property of replica object must have a boolean value',
    )
  if (isNullOrEmpty(replicaSettings.replicaSig))
    throw new Error(
      'replicaSig property of replica object of current experiment was not defined',
    )
  if (
    replicaSettings.replicaSig != 'nosig' &&
    replicaSettings.replicaSig != 'ecdsa' &&
    replicaSettings.replicaSig != 'default'
  )
    throw new Error(
      'replicaSig property of replica object must have <nosig | default | ecdsa> as value',
    )
  if (isNullOrEmpty(clientSettings.numberOfHosts))
    throw new Error(
      'clients property of client object of current experiment was not defined',
    )
  if (!Number.isInteger(clientSettings.numberOfHosts))
    throw new Error('clients property of client object must be an Integer')
  if (isNullOrEmpty(clientSettings.threadsPerClient))
    throw new Error(
      'threadsPerClient property of client object of current experiment was not defined',
    )
  if (!Number.isInteger(clientSettings.threadsPerClient))
    throw new Error(
      'threadsPerClient property of client object must be an Integer',
    )
  if (isNullOrEmpty(clientSettings.opPerClient))
    throw new Error(
      'opPerClient property of client object of current experiment was not defined',
    )
  if (!Number.isInteger(clientSettings.opPerClient))
    throw new Error('opPerClient property of client object must be an Integer')
  if (isNullOrEmpty(clientSettings.clientInterval))
    throw new Error(
      'clientInterval property of client object of current experiment was not defined',
    )
  if (!Number.isInteger(clientSettings.clientInterval))
    throw new Error(
      'clientInterval property of client object must be an Integer',
    )
  if (isNullOrEmpty(clientSettings.requestSize))
    throw new Error(
      'requestSize property of client object of current experiment was not defined',
    )
  if (!Number.isInteger(clientSettings.requestSize))
    throw new Error('requestSize property of client object must be an Integer')
  if (isNullOrEmpty(clientSettings.readOnly))
    throw new Error(
      'readOnly property of client object of current experiment was not defined',
    )
  if (!isBoolean(clientSettings.readOnly))
    throw new Error(
      'readOnly property of client object must have a boolean value',
    )
  if (isNullOrEmpty(clientSettings.clientSig))
    throw new Error(
      'clientSig property of client object of current experiment was not defined',
    )
  if (
    clientSettings.clientSig != 'nosig' &&
    clientSettings.clientSig != 'ecdsa' &&
    clientSettings.clientSig != 'default'
  )
    throw new Error(
      'clientSig property of client object must have <nosig | default | ecdsa> as value',
    )
  if (!isBoolean(clientSettings.verbose))
    throw new Error(
      'verbose property of client object must have a boolean value',
    )
}

function getProcessName() {
  return processName
}
function getExecutionDir() {
  return process.env.BFTSMART_EXECUTION_DIR
}
function getExperimentsOutputDirectory() {
  return process.env.BFTSMART_EXPERIMENTS_OUTPUT_DIR
}
async function build(replicaSettings, clientSettings, log) {
  log.info('building BFT-SMaRt ...')
  let cmd = { proc: './gradlew', args: ['installDist'] }
  await promisified_spawn(cmd.proc, cmd.args, process.env.BFTSMART_DIR, log)
  log.info('BFT-SMaRt build terminated sucessfully!')
}
async function genSystemConfig(replicas, batchsize) {
  let viewString = ''

  for (let i = 0; i < replicas; i++)
    viewString += i + (i < replicas - 1 ? ',' : '')
  sysconf['system.initial.view'] = viewString
  sysconf['system.servers.num'] = replicas
  sysconf['system.servers.f'] = Math.floor((replicas - 1) / 3)
  sysconf['system.totalordermulticast.maxbatchsize'] = batchsize
  let sysconfString = ''

  for (const [key, value] of Object.entries(sysconf)) {
    sysconfString += key + ' = ' + value + '\n'
  }

  fs.writeFileSync(
    path.join(
      process.env.BFTSMART_DIR,
      process.env.BFTSMART_SYSTEM_CONFIG_FILE,
    ),
    sysconfString,
  )
}
async function genHostsConfig(replicas, clients) {
  let ipObject = {}
  ipObject[process.env.BFTSMART_REPLICA_HOST_PREFIX] = replicas
  ipObject[process.env.BFTSMART_CLIENT_HOST_PREFIX] = clients
  let replicaIPs = await ipUtil.getIPs(ipObject)
  let clientIndex = 7000
  let hostsString = ''
  for (let i = 0; i < replicaIPs.length; i++) {
    if (
      replicaIPs[i].name.startsWith(process.env.BFTSMART_REPLICA_HOST_PREFIX)
    ) {
      hostsString += `${i} ${replicaIPs[i].ip} ${process.env.BFTSMART_REPLICA_PORT} ${process.env.BFTSMART_REPLICA_SECONDARY_PORT}\n`
      replicaIPs[i].isClient = false
    } else {
      hostsString += `${clientIndex} ${replicaIPs[i].ip} ${process.env.BFTSMART_CLIENT_PORT}\n`
      replicaIPs[i].isClient = true
      replicaIPs[i].clientIndex = clientIndex
      clientIndex += 1000
    }
  }
  fs.writeFileSync(
    path.join(process.env.BFTSMART_DIR, process.env.BFTSMART_HOSTS_FILE),
    hostsString,
  )
  return replicaIPs
}
async function passArgs(replicaIPs, replicaSettings, clientSettings) {
  for (let i = 0; i < replicaIPs.length; i++) {
    if (replicaIPs[i].isClient) {
      replicaIPs[i].procs = []
      replicaIPs[i].procs.push({
        path: javaProc,
        env: '',
        args: `${process.env.BFTSMART_JAVA_ARGS} ${
          process.env.BFTSMART_CLIENT_CLASS
        } ${replicaIPs[i].clientIndex} ${clientSettings.threadsPerClient} ${
          clientSettings.opPerClient
        } ${clientSettings.requestSize} ${clientSettings.clientInterval} ${
          clientSettings.readOnly
        } ${
          !isNullOrEmpty(clientSettings.verbose) ? clientSettings.verbose : true
        } ${clientSettings.clientSig}`,
        startTime: clientSettings.startTime ? clientSettings.startTime : 0,
      })
    } else {
      replicaIPs[i].procs = []
      replicaIPs[i].procs.push({
        path: javaProc,
        env: '',
        args: `${process.env.BFTSMART_JAVA_ARGS} ${process.env.BFTSMART_REPLICA_CLASS} ${i} ${replicaSettings.replicaInterval} ${replicaSettings.replySize} ${replicaSettings.stateSize} ${replicaSettings.context} ${replicaSettings.replicaSig}`,
        startTime: 0,
      })
    }
  }

  return replicaIPs
}
async function deleteCurrentView() {
  try {
    fs.unlinkSync(
      path.join(process.env.BFTSMART_DIR, process.env.BFTSMART_VIEW_FILE),
    )
  } catch (err) {
    console.error(err)
  }
}
async function configure(replicaSettings, clientSettings, log) {
  log.info('parsing replica and client objects')
  _parse(replicaSettings, clientSettings)
  log.info('objects parsed!')
  log.info('deleting old view')
  await deleteCurrentView()
  log.info('generating system.config ...')
  await genSystemConfig(replicaSettings.replicas, replicaSettings.blockSize)
  log.info('system.config generated!')
  log.info('generating hosts.config ...')
  var replicaIPs = await genHostsConfig(
    replicaSettings.replicas,
    clientSettings.numberOfHosts,
  )
  log.info('hosts.config generated!')
  replicaIPs = await passArgs(replicaIPs, replicaSettings, clientSettings)
  return replicaIPs
}

module.exports = {
  build,
  configure,
  getProcessName,
  getExecutionDir,
  getExperimentsOutputDirectory,
}
