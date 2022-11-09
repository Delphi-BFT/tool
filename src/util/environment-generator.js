const { getLatencies } = require('./cloudping')
const { transformLatencies, isNullOrEmpty } = require('./helpers')
const yaml = require('js-yaml')
const { isNull } = require('mathjs')
const fs = require('fs').promises
const SELF_LOOP_LATENCY = '10 us'
const tab = '  '
function parseEDF(EDF) {
  /* TODO: parse misc object of experiments?
   * check if latency specification for non-AWS latencies is conform to Shadow's expectations?
   * check if AWS Region is valid
   */
  if (isNullOrEmpty(EDF.protocolConnectorPath))
    throw Error('please specify a protocol connector')
  if (isNullOrEmpty(EDF.experiments))
    throw Error('No experiments were specified')
  for (const EDO of EDF.experiments) {
    let experimentId = EDO.name
    if (isNullOrEmpty(EDO.network))
      throw Error(`network Object for ${experimentId} cannot be empty`)
    if (isNullOrEmpty(EDO.network.latency))
      throw Error(`latency Object for ${experimentId}.network cannot be empty`)
    if (isNullOrEmpty(EDO.replica))
      throw Error(`replica Object for ${experimentId} cannot be empty`)
    if (isNullOrEmpty(EDO.client))
      throw Error(`client Object for ${experimentId} cannot be empty`)
    if (isNullOrEmpty(EDO.network.latency.uniform))
      throw Error(`please specify a latency type for ${experimentId}`)
    if (
      isNullOrEmpty(EDO.network.latency.clients) ||
      isNullOrEmpty(EDO.network.latency.replicas)
    )
      throw Error(
        `please inter-replica latency and client-replica latency for ${experimentId}`,
      )
    if (isNullOrEmpty(EDO.replica.replicas)) {
      throw Error(`number of replicas for ${experimentId} was not defined`)
    }
    if (isNullOrEmpty(EDO.client.numberOfHosts)) {
      throw Error(`number of client hosts for ${experimentId} was not defined`)
    }
    if (!EDO.network.latency.uniform) {
      if (!Array.isArray(EDO.network.latency.replicas))
        throw Error(
          `please specify an array in the form of [region1: numberOfReplicas, region2: numberOfReplicas] for ${experimentId}`,
        )
      let totalNumberOfReplicas = 0
      for (let region of EDO.network.latency.replicas) {
        totalNumberOfReplicas += Object.values(region)[0]
      }
      if (totalNumberOfReplicas != EDO.replica.replicas)
        throw Error(
          `sum of replica hosts accross all regions is different than experiment.replica.replicas for ${experimentId}`,
        )
      if (Array.isArray(EDO.network.latency.clients)) {
        let totalNumberOfClients = 0
        for (let region of EDO.network.latency.clients) {
          totalNumberOfClients += Object.values(region)[0]
        }
        if (totalNumberOfClients != EDO.client.numberOfHosts)
          throw Error(
            `sum of client hosts accross all regions is different than experiment.client.clients for ${experimentId}`,
          )
      }
    }
  }
}
/* Author : Christian Berger */
let createNode = (id, up, down) => {
  return (
    tab +
    'node [\n' +
    tab +
    tab +
    'id ' +
    id +
    '\n' +
    tab +
    tab +
    'host_bandwidth_up  "' +
    up +
    '"\n' +
    tab +
    tab +
    'host_bandwidth_down "' +
    down +
    '"\n' +
    tab +
    '] \n'
  )
}

/* Author : Christian Berger */
let createEdge = (source, target, latency, packet_loss) => {
  return (
    tab +
    'edge [\n' +
    tab +
    tab +
    'source ' +
    source +
    '\n' +
    tab +
    tab +
    'target ' +
    target +
    '\n' +
    tab +
    tab +
    'latency "' +
    latency +
    '"' +
    '\n' +
    tab +
    tab +
    'packet_loss ' +
    packet_loss +
    '\n' +
    tab +
    '] \n'
  )
}

/* Author : Christian Berger */
let createGraph = (
  hosts,
  host_bandwidth_up,
  host_bandwidth_down,
  latencies,
  packet_losses,
) => {
  let graph = 'graph [\n'
  graph += tab + 'directed 1\n'

  // Create all Nodes
  for (let i = 0; i < hosts.length; i++) {
    graph += createNode(i, host_bandwidth_up[i], host_bandwidth_down[i])
  }

  // Create all Edges
  for (let i = 0; i < hosts.length; i++) {
    for (let j = 0; j < hosts.length; j++) {
      graph += createEdge(i, j, latencies[i][j], packet_losses[i][j])
    }
  }

  // Finish the Graph
  graph += ']\n'
  return graph
}

/* Author : Christian Berger */
let createGraphSimple = (
  hosts,
  replicaBwUp,
  replicaBwDown,
  clientBwUp,
  clientBwDown,
  replicaDelay,
  clientDelay,
  packet_loss,
) => {
  let host_bandwidth_up = []
  let host_bandwidth_down = []
  let latencies = []
  let packet_losses = []

  for (let i = 0; i < hosts.length; i++) {
    // Init all hosts
    if (!hosts[i].isClient) {
      host_bandwidth_up.push(replicaBwUp)
      host_bandwidth_down.push(replicaBwDown)
    } else {
      host_bandwidth_up.push(clientBwUp)
      host_bandwidth_down.push(clientBwDown)
    }

    latencies.push([])
    packet_losses.push([])

    // Create the edges between the hosts...
    for (let j = 0; j < hosts.length; j++) {
      if (i == j) {
        latencies[i].push(SELF_LOOP_LATENCY)
        packet_losses[i].push(packet_loss)
        continue
      }
      if (hosts[i].isClient || hosts[j].isClient) latencies[i].push(clientDelay)
      else latencies[i].push(replicaDelay)
      packet_losses[i].push(packet_loss)
    }
  }

  return createGraph(
    hosts,
    host_bandwidth_up,
    host_bandwidth_down,
    latencies,
    packet_losses,
  )
}

/* Author : Christian Berger */
let createShadowHost = (prefix, name, ip, id, path, env, args, start_time) => {
  return (
    tab +
    prefix +
    name +
    ':' +
    '\n' +
    tab +
    tab +
    'network_node_id: ' +
    id +
    '\n' +
    tab +
    tab +
    'ip_addr: ' +
    ip +
    '\n' +
    tab +
    tab +
    'processes: ' +
    '\n' +
    tab +
    tab +
    '- ' +
    'path: ' +
    path +
    '\n' +
    tab +
    tab +
    tab +
    'environment: ' +
    env +
    '\n' +
    tab +
    tab +
    tab +
    'args: ' +
    args +
    '\n' +
    tab +
    tab +
    tab +
    'start_time: ' +
    start_time +
    '\n'
  )
}

async function makeAWSGraph(
  replicasIPs,
  replicaLatencies,
  clientLatencies,
  replicaBwUp,
  replicaBwDown,
  clientBwUp,
  clientBwDown,
  packet_loss,
  log,
) {
  let awsLatencies = await getLatencies(log)
  let awsReplicas = await transformLatencies(replicaLatencies)
  let awsClients = null
  if (clientLatencies && Array.isArray(clientLatencies))
    awsClients = await transformLatencies(clientLatencies)
  let latencies = []
  let packet_losses = []
  let host_bandwidth_up = []
  let host_bandwidth_down = []
  let currentReplicaIndex = 0
  let currentClientIndex = 0
  let replicaIndex = {}
  let clientIndex = {}

  for (let i = 0; i < replicasIPs.length; i++) {
    if (replicasIPs[i].isClient)
      if (!clientLatencies) continue
      else clientIndex[i] = currentClientIndex++

    replicaIndex[i] = currentReplicaIndex++
  }
  for (let i = 0; i < replicasIPs.length; i++) {
    latencies.push([])
    packet_losses.push([])
    if (!replicasIPs[i].isClient) {
      host_bandwidth_up.push(replicaBwUp)
      host_bandwidth_down.push(replicaBwDown)
    } else {
      host_bandwidth_up.push(clientBwUp)
      host_bandwidth_down.push(clientBwDown)
    }
    for (let j = 0; j < replicasIPs.length; j++) {
      if (i == j) {
        latencies[i].push(SELF_LOOP_LATENCY)
        packet_losses[i].push(packet_loss)
        continue
      }

      if (replicasIPs[i].isClient || replicasIPs[j].isClient) {
        if (clientLatencies && !Array.isArray(clientLatencies))
          latencies[i].push(clientLatencies)
        else {
          latencies[i].push(
            awsLatencies[
              replicasIPs[i].isClient
                ? awsClients[clientIndex[i]]
                : awsReplicas[replicaIndex[i]]
            ][
              replicasIPs[j].isClient
                ? awsClients[clientIndex[j]]
                : awsReplicas[replicaIndex[j]]
            ] + ' us',
          )
        }
      } else
        latencies[i].push(
          awsLatencies[awsReplicas[replicaIndex[i]]][
            awsReplicas[replicaIndex[j]]
          ] + ' us',
        )
      packet_losses[i].push(packet_loss)
    }
  }
  return createGraph(
    replicasIPs,
    host_bandwidth_up,
    host_bandwidth_down,
    latencies,
    packet_losses,
  )
}

let makeConfigTemplate = async (shadowTemplate, fullPathgml, dir, misc) => {
  let res = new Object()
  if (shadowTemplate) res = yaml.load(await fs.readFile(shadowTemplate, 'utf8'))
  // handle an undefined res here?
  if (!res.general) res.general = new Object()
  res.general.stop_time = misc.duration ? misc.duration : res.general.stop_time
  res.general.data_directory = dir ? dir : res.general.data_directory
  res.general.parallelism = misc.parallelism
    ? misc.parallelism
    : res.general.parallelism
  if (!res.experimental) res.experimental = new Object()
  res.experimental.use_legacy_working_dir = true
  res.experimental.runahead = misc.runahead
  res.network = new Object()
  res.network.graph = { type: 'gml', file: { path: fullPathgml } }
  res.network.use_shortest_path = misc.useShortestPath
  res.hosts = new Object()
  return res
}
let makeHost = (res, name, ip, network_node_id, procs) => {
  let processes = []
  for (let i = 0; i < procs.length; i++) {
    let procsObj = {
      path: procs[i].path,
      environment: procs[i].env,
      args: procs[i].args,
      start_time: procs[i].startTime,
    }
    if (procs[i].stopTime) procsObj['stop_time'] = procs[i].stopTime
    processes.push(procsObj)
  }
  res.hosts[name] = {
    ip_addr: ip,
    network_node_id: network_node_id,
    processes: processes,
  }
  return res
}
async function out(file, doc) {
  await fs.writeFile(file, yaml.dump(doc))
}
async function exportPNS(hosts, networkObj, PNSPath, log) {
  let PNS = ''
  if (networkObj.latency.uniform)
    PNS = createGraphSimple(
      hosts,
      networkObj.replicaBandwidthUp,
      networkObj.replicaBandwidthDown,
      networkObj.clientBandwidthUp,
      networkObj.clientBandwidthDown,
      networkObj.latency.replicas,
      networkObj.latency.clients,
      parseFloat(networkObj.packetLoss).toFixed(1),
    )
  else {
    PNS = await makeAWSGraph(
      hosts,
      networkObj.latency.replicas,
      networkObj.latency.clients,
      networkObj.replicaBandwidthUp,
      networkObj.replicaBandwidthDown,
      networkObj.clientBandwidthUp,
      networkObj.clientBandwidthDown,
      parseFloat(networkObj.packetLoss).toFixed(1.0),
      log,
    )
  }
  await fs.writeFile(PNSPath, PNS)
}
module.exports = {
  createShadowHost,
  exportPNS,
  createEdge,
  createNode,
  makeHost,
  out,
  makeConfigTemplate,
  parseEDF,
}
