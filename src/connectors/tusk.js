const fs = require('fs').promises
const path = require('path')
const ipUtil = require('../util/ip-util')
const { promisified_spawn } = require('../util/exec')
const util = require('util')
const exec = util.promisify(require('node:child_process').exec)
const { isNullOrEmpty } = require('../util/helpers')

const processName = 'node'
const BASE_PORT = 3000

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
  if (isNullOrEmpty(clientSettings.clients))
    throw new Error(
      'clients property of client object of current experiment was not defined',
    )
  if (!Number.isInteger(clientSettings.clients))
    throw new Error('clients property of client object must be an Integer')
  if (isNullOrEmpty(clientSettings.requestSize))
    throw new Error(
      'requestSize property of client object of current experiment was not defined',
    )
  if (!Number.isInteger(clientSettings.requestSize))
    throw new Error('requestSize property of client object must be an Integer')
}

function getProcessName() {
  return processName
}

function getExecutionDir() {
  return process.env.TUSK_EXECUTION_DIR
}

function getExperimentsOutputDirectory() {
  return process.env.TUSK_EXPERIMENTS_OUTPUT_DIR
}


async function generateCommittee(replicaSettings, log) {
  log.info('Create the Tusk Committee')

  /** Committee Creation **/
  let committee = {
    authorities: new Map()
  }

  // Define new, random IPs
    let hostIPs = await ipUtil.getIPs({
      [process.env.TUSK_REPLICA_HOST_PREFIX]: replicaSettings.replicas,
      [process.env.TUSK_CLIENT_HOST_PREFIX]: 1, // TODO support arbitrary number of clients
    })
    for (let i = 0; i < hostIPs.length; i++) {
      if (hostIPs[i].name.startsWith(process.env.TUSK_REPLICA_HOST_PREFIX))
        hostIPs[i].isClient = false
      else hostIPs[i].isClient = true
    }

    log.info(JSON.stringify(hostIPs))


   // For each replica, add it to the committee
  for (let i=0; i<replicaSettings.replicas; i++) {

    const nodeFilePath = path.join(process.env.TUSK_DIR, '.node-'+i+'.json')
    log.info('path: ' + nodeFilePath)
    let replicaKeyFile = await fs.readFile(nodeFilePath)
    const rFile = JSON.parse(replicaKeyFile)
    const name = rFile.name
    const authority =
    {
      primary: {
        primary_to_primary: ''+hostIPs[i].ip + ':'+ (BASE_PORT+0),
        worker_to_primary: ''+hostIPs[i].ip +  ':'+ (BASE_PORT+1)
      },
      stake: 1,
      workers: {
        0: {
          primary_to_worker:  ''+hostIPs[i].ip +  ':'+ (BASE_PORT+2),
          transactions:  ''+hostIPs[i].ip +  ':'+ (BASE_PORT+3),
          worker_to_worker:  ''+hostIPs[i].ip +  ':'+ (BASE_PORT+4)
        }
      }
    }

    log.info(name)
    log.info(JSON.stringify(authority))
    committee.authorities[name] = authority
  }
  log.info(JSON.stringify(committee))
  const committeeFilePath = path.join(process.env.TUSK_DIR, '.committee.json')
  await fs.writeFile(committeeFilePath, JSON.stringify(committee,null, 2))
 return hostIPs
}

async function generateKeys(numKeys, log) {
// log.info(`generating keys for ${numKeys} replicas...`)
//   try {
//    await fs.mkdir(
//      path.join(process.env.TUSK_DIR, process.env.TUSK_KEYS_DIR),
//    )
//  } catch (error) {
//    log.warn('using a pre-existing keys directory')
//  }

  for (let i=0; i<numKeys; i++) {
    fileName= 'node-' + i + '.json'
    let cmd = {
            proc: './node',
	    args: [
	      'generate_keys',
	      '--filename',
	      fileName
	    ]}
	     await promisified_spawn(cmd.proc, cmd.args, process.env.TUSK_DIR, log)
	   }

  log.info('keys generated successfully!')
}

async function getStats(experimentId, log) {
  log.info('stub not implemented')
  return null
}

async function createConfigFile(replicaSettings, log) {
  log.info('generating Tusk config ...')
  let hosts = await generateCommittee(replicaSettings,log)

  log.info('Writing parameter into params config file...')
  // Generate ParamsConfigFile TODO
  let paramsString = await fs.readFile('./src/connectors/assets/tusk/params.json')
  let params = JSON.parse(paramsString)
  // Update Block Size
  params.batch_size = replicaSettings.blockSize != undefined ? replicaSettings.blockSize : params.batchSize
  // Update Delays
  params.max_batch_delay = replicaSettings.maxBlockDelay != undefined ? replicaSettings.maxBlockDelay : params.max_batch_delay
  params.max_header_delay = replicaSettings.maxHeaderDelay!= undefined ? replicaSettings.maxHeaderDelay : params.max_header_delay

  // Then copy the file with JSON stringify and FS.Write to benchmark DIRECTORY
  const paramsFilePath = path.join(process.env.TUSK_DIR, '.params.json')
  await fs.writeFile(paramsFilePath, JSON.stringify(params, null, 2))

  log.info('Finished creating all config files!')
  return hosts
}

async function passArgs(hosts, replicaSettings, clientSettings, log) {
  log.info('passing arguments to hosts')
  let replicaIndex = 0
  let clientIndex = 0
  // First, attach all replica program arguments to hosts configuration
  for (let i = 0; i < hosts.length; i++) {
      hosts[i].procs = []
      // is a replica
      if (!hosts[i].isClient) {

      // Run a Primary
      hosts[i].procs.push({
        path: path.join(process.env.TUSK_DIR, process.env.TUSK_REPLICA_BIN),
        env: 'RUST_LOG=DEBUG',
        args: `-vvv run --keys .node-${replicaIndex}.json --committee .committee.json --store ${process.env.TUSK_EXPERIMENTS_OUTPUT_DIR}/.db-p-${replicaIndex} --parameters .params.json primary`,
        start_time: 0,
      })
     // Run a Worker
      hosts[i].procs.push({
        path: path.join(process.env.TUSK_DIR, process.env.TUSK_REPLICA_BIN),
        env: 'RUST_LOG=DEBUG',
        args: `-vvv run --keys .node-${replicaIndex}.json --committee .committee.json --store ${process.env.TUSK_EXPERIMENTS_OUTPUT_DIR}/.db-w-${replicaIndex} --parameters .params.json worker --id 0`,
        start_time: '${clientSettings.startTime}'
      })

      replicaIndex++

    } else { // client needs to be deployed

      const addresses = []
      // Connect with 'replicasToConnect' many replicas as specified in EDF. If unspecified, use default -> 4
      const replicasToConnect = clientSettings.replicasToConnect != undefined ? Math.min(clientSettings.replicasToConnect, replicaSettings.replicas) : 4
      for (let j = 0; j < replicasToConnect; j++) {
        const addr = '' + hosts[(clientIndex+j)%replicaSettings.replicas].ip + ':3003' // 3003 is default transactions port
        addresses.push(addr)
      }

      let addressString = ''
      addresses.forEach((item, i) => {
        addressString += (' ' + item)
      });

      // Run a Client
      hosts[i].procs.push({
        path: path.join(process.env.TUSK_DIR, process.env.TUSK_CLIENT_BIN),
        env: 'RUST_LOG=INFO',
        args: `${addresses[0]} --size ${clientSettings.requestSize} --rate ${clientSettings.rate} --nodes ${addressString}`,
        start_time: 0,
      })

      clientIndex++

    }
  }
  log.info('Successfully passed arguments. For example see \n ' + JSON.stringify(hosts[0].procs, null, 2))

  return hosts;
}

async function configure(replicaSettings, clientSettings, log) {
   log.info('parsing replica and client objects')
  _parse(replicaSettings, clientSettings)
  log.info('objects parsed!')
  await generateKeys(replicaSettings.replicas, log)
  let hosts = await createConfigFile(replicaSettings, log)
  hosts = await passArgs(hosts, replicaSettings, clientSettings, log) // TODO
  return hosts
}

async function build(replicaSettings, clientSettings, log) {
  log.info('initating Narwhal-Tusk Build...')
  let cmd = { proc: 'cargo', args: ['build', '--bins', '--release', '--features', 'benchmark'] }
  await promisified_spawn(cmd.proc, cmd.args, process.env.TUSK_DIR, log)
  log.info('Tusk build terminated sucessfully!')
}


module.exports = {
  build,
  configure,
  getStats,
  getProcessName,
  getExecutionDir,
  getExperimentsOutputDirectory,
}
