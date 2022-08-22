const yaml = require('js-yaml')
const fs = require('fs').promises
let makeConfigTemplate = (fullPathgml, dir, misc) => {
  let res = new Object()
  res.general = {
    stop_time: misc.duration,
    data_directory: dir,
    parallelism: misc.parallelism,
  }
  res.experimental = new Object()
  res.experimental.use_legacy_working_dir = true
  res.experimental.runahead = misc.runahead
  res.network = new Object()
  res.network.graph = { type: 'gml', file: { path: fullPathgml } }
  res.network.use_shortest_path = misc.useShortestPath
  res.hosts = new Object()
  return res
}
let makeHost = (res, name, ip, network_node_id, procs) => {
  /* let newHost = new Object();
    newHost[name] = new Object();
    newHost[name].ip_addr = ip;
    newHost[name].network_node_id = network_node_id;
    newHost[name].path = path;
    newHost[name].env = env;
    newHost[name].args = args;
    newHost[name].start_time = start_time;*/
  let processes = []
  for (let i = 0; i < procs.length; i++) {
    processes.push({
      path: procs[i].path,
      environment: procs[i].env,
      args: procs[i].args,
      start_time: procs[i].start_time,
    })
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

module.exports = { makeHost, out, makeConfigTemplate }
