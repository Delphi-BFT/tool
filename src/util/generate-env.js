const fs = require('fs');
const { getLatencies } = require('./cloudping');
const { transformLatencies } = require('./helpers');
const tab = '  ';

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
  );
};

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
    ' ms"' +
    '\n' +
    tab +
    tab +
    'packet_loss ' +
    packet_loss +
    '\n' +
    tab +
    '] \n'
  );
};

/* Author : Christian Berger */
let createGraph = (
  hosts,
  host_bandwidth_up,
  host_bandwidth_down,
  latencies,
  packet_losses,
) => {
  let graph = 'graph [\n';
  graph += tab + 'directed 1\n';

  // Create all Nodes
  for (let i = 0; i < hosts.length; i++) {
    graph += createNode(i, host_bandwidth_up[i], host_bandwidth_down[i]);
  }

  // Create all Edges
  for (let i = 0; i < hosts.length; i++) {
    for (let j = 0; j < hosts.length; j++) {
      graph += createEdge(i, j, latencies[i][j], packet_losses[i][j]);
    }
  }

  // Finish the Graph
  graph += ']\n';
  return graph;
};

/* Author : Christian Berger */
let createGraphSimple = (
  hosts,
  bandwidth_up,
  bandwidth_down,
  latency,
  packet_loss,
) => {
  let host_bandwidth_up = [];
  let host_bandwidth_down = [];
  let latencies = [];
  let packet_losses = [];

  for (let i = 0; i < hosts.length; i++) {
    // Init all hosts
    if (!hosts[i].isClient) {
      host_bandwidth_up.push(bandwidth_up);
      host_bandwidth_down.push(bandwidth_down);
    } else {
      // idea: the last host should be reserved to place the clients!
      // thus it should get unlimited bandwidth
      host_bandwidth_up.push('100 Gbit');
      host_bandwidth_down.push('100 Gbit');
    }

    latencies.push([]);
    packet_losses.push([]);

    // Create the edges between the hosts...
    for (let j = 0; j < hosts.length; j++) {
      if (hosts[i].isClient || hosts[j].isClient) latencies[i].push(1);
      else latencies[i].push(latency);
      packet_losses[i].push(packet_loss);
    }
  }

  return createGraph(
    hosts,
    host_bandwidth_up,
    host_bandwidth_down,
    latencies,
    packet_losses,
  );
};

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
  );
};
async function makeAWSGraph(
  replicasIPs,
  hosts,
  bandwidth_up,
  bandwidth_down,
  packet_loss,
  log,
) {
  let awsLatencies = await getLatencies(log);
  let awsHosts = await transformLatencies(hosts);
  let latencies = [];
  let packet_losses = [];
  let host_bandwidth_up = [];
  let host_bandwidth_down = [];
  let currentIndex = 0;
  let replicaIndex = {};

  for (let i = 0; i < replicasIPs.length; i++) {
    if (replicasIPs[i].isClient) continue;
    replicaIndex[i] = currentIndex++;
  }
  for (let i = 0; i < replicasIPs.length; i++) {
    latencies.push([]);
    packet_losses.push([]);
    if (!replicasIPs[i].isClient) {
      host_bandwidth_up.push(bandwidth_up);
      host_bandwidth_down.push(bandwidth_down);
    } else {
      // idea: the last host should be reserved to place the clients!
      // thus it should get unlimited bandwidth
      host_bandwidth_up.push('100 Gbit');
      host_bandwidth_down.push('100 Gbit');
    }
    for (let j = 0; j < replicasIPs.length; j++) {
      if (replicasIPs[i].isClient || replicasIPs[j].isClient || i==j)
        latencies[i].push(1);
      else {
        latencies[i].push(
          awsLatencies[awsHosts[replicaIndex[i]]][awsHosts[replicaIndex[j]]],
        );
      }
      packet_losses[i].push(packet_loss);
    }
  }
  return createGraph(
    replicasIPs,
    host_bandwidth_up,
    host_bandwidth_down,
    latencies,
    packet_losses,
  );
}
module.exports = {
  createShadowHost,
  createGraph,
  createGraphSimple,
  createEdge,
  createNode,
  makeAWSGraph,
};
