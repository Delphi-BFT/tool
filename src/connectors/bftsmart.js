const fs = require('fs').promises
const { promisified_spawn } = require('../util/exec')
const path = require('path')
const ipUtil = require('../util/ip-util')
const { isNullOrEmpty, JSONtoDot } = require('../util/helpers')
const { isBoolean, isInteger } = require('mathjs')
const bftsmartSysConf = require('./assets/BFT-SMaRt/sysconf.json')
const { after, secondsAsString } = require('../util/timestamp')

const processName = 'java'

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
  if (isNullOrEmpty(replicaSettings.bft))
    throw new Error('please specify if BFT-SMaRt should use BFT mode')
  if (!isBoolean(replicaSettings.bft))
    throw new Error('experiment.replica.bft must have a boolean value')
  if (isNullOrEmpty(replicaSettings.timeout))
    throw new Error('please specify a timeout value')
  if (
    !Number.isInteger(replicaSettings.timeout) ||
    !(replicaSettings.timeout > 0)
  )
    throw new Error('experiment.replica.timeout must be a positive Integer')
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
  if (
    !Number.isInteger(clientSettings.clientInterval) &&
    Number(clientSettings.clientInterval) > 0
  )
    throw new Error(
      'clientInterval property of client object must be a positive integer',
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
  if (
    !isNullOrEmpty(clientSettings.maxInFlight) &&
    !Number.isInteger(clientSettings.maxInFlight) &&
    !Number(clientSettings.maxInFlight) > 0
  )
    throw new Error('maxInFlight must be a positive integer')
  if (isNullOrEmpty(clientSettings.invokeOrderedTimeout))
    throw new Error('experiment.client.invokeOrderedTimeout must be specified')
  if (
    !Number.isInteger(clientSettings.invokeOrderedTimeout) ||
    !(clientSettings.invokeOrderedTimeout > 0)
  )
    throw new Error(
      'experiment.client.invokeOrderedTimeout must be a positive Integer',
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
async function genSystemConfig(replicaSettings, clientSettings) {
  let viewString = ''

  for (let i = 0; i < replicaSettings.replicas; i++)
    viewString += i + (i < replicaSettings.replicas - 1 ? ',' : '')

  bftsmartSysConf.system.bft = replicaSettings.bft
  bftsmartSysConf.system.initial = new Object()
  bftsmartSysConf.system.initial.view = viewString
  bftsmartSysConf.system.servers = new Object()
  bftsmartSysConf.system.servers.num = replicaSettings.replicas
  bftsmartSysConf.system.servers.f = Math.floor(
    (replicaSettings.replicas - 1) / 3,
  )
  bftsmartSysConf.system.totalordermulticast.maxbatchsize =
    replicaSettings.blockSize
  bftsmartSysConf.system.totalordermulticast.timeout = replicaSettings.timeout
  bftsmartSysConf.system.client = new Object()
  bftsmartSysConf.system.client.invokeOrderedTimeout =
    clientSettings.invokeOrderedTimeout

  let sysconfString = JSONtoDot('', bftsmartSysConf)

  await fs.writeFile(
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
  await fs.writeFile(
    path.join(process.env.BFTSMART_DIR, process.env.BFTSMART_HOSTS_FILE),
    hostsString,
  )
  return replicaIPs
}
async function passArgs(replicaIPs, replicaSettings, clientSettings) {
  let currentReplicaStartTime = 0
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
        } ${clientSettings.clientSig} ${clientSettings.maxInFlight}`,
        startTime: after(
          after('0 s', secondsAsString(replicaSettings.replicas)),
          clientSettings.startTime ? clientSettings.startTime : '0 s',
        ),
      })
    } else {
      replicaIPs[i].procs = []
      replicaIPs[i].procs.push({
        path: javaProc,
        env: '',
        args: `${process.env.BFTSMART_JAVA_ARGS} ${process.env.BFTSMART_REPLICA_CLASS} ${i} ${replicaSettings.replicaInterval} ${replicaSettings.replySize} ${replicaSettings.stateSize} ${replicaSettings.context} ${replicaSettings.replicaSig}`,
        startTime: after('0 s', secondsAsString(currentReplicaStartTime++)),
      })
    }
  }

  return replicaIPs
}
async function deleteCurrentView() {
  try {
    await fs.unlink(
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
  await genSystemConfig(replicaSettings, clientSettings)
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
