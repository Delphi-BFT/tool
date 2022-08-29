const yaml = require('js-yaml')
const fs = require('fs').promises
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
    processes.push({
      path: procs[i].path,
      environment: procs[i].env,
      args: procs[i].args,
      start_time: procs[i].startTime,
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
