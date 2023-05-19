const pidusage = require('pidusage')
const util = require('util')
const { median } = require('./helpers')
const exec = util.promisify(require('node:child_process').exec)
const si = require('systeminformation')

const procIntervals = new Map()

async function getPids(processName, log) {
  try {
    let result = await exec(`pidof ${processName}`)
    return result.stdout.toString().split(' ').map(Number)
  } catch (error) {
    log.error(`could not retrieve usage data for ${processName}`)
    return null
  }
}

async function compute(processName, log) {
  let pids = await getPids(processName, log)
  if (pids == null) throw 'could not fetch usage data'
  pidusage(pids, function (err, stats) {
    let cputotal = 0.0
    let mem = 0.0
    if (stats != null && stats != undefined) {
      Object.keys(stats).forEach(function (key) {
        cputotal += stats[key] == undefined ? 0 : stats[key].cpu
        mem += stats[key] == undefined ? 0 : stats[key].memory / 1000000000
      })
    }
    log.info(`current cpu usage of ${processName} process: ${cputotal}`)
    log.info(`current mem usage of ${processName} process: ${mem}`)
    procIntervals[processName].stats.cpu.push(cputotal)
    procIntervals[processName].stats.mem.push(mem)
  })
}
async function register(processName, time, log) {
  let interval = setInterval(async function () {
    await compute(processName, log).catch((error) => {
      log.error(
        `an error occurred while fetching usage data for ${processName} unregistering...`,
      )
      unregister(log)
    })
  }, time)
  let intervalObject = {}
  intervalObject['interval'] = interval
  intervalObject['stats'] = {}
  intervalObject.stats.cpu = []
  intervalObject.stats.mem = []
  procIntervals[processName] = intervalObject
}
async function unregister(log) {
  log.info('clearing intervals ...')
  let usage = {}
  for (let proc in procIntervals) {
    clearInterval(procIntervals[proc].interval)
    usage[proc] = {}
    usage[proc].medianCPU = null
    if (procIntervals[proc].stats.cpu)
      usage[proc].medianCPU = median(procIntervals[proc].stats.cpu)
    usage[proc].maxMEM = Math.max(...procIntervals[proc].stats.mem)
    procIntervals.delete(proc)
  }
  log.info('intervals cleared!')
  return usage
}
async function registerSI(time, log) {
  let interval = setInterval(async function () {
    let totalMemUsage = (await si.mem()).active / 1000000000
    log.info(`current total mem usage of host: ${totalMemUsage}`)
    procIntervals['total'].stats.mem.push(totalMemUsage)
  }, time)
  let intervalObject = {}
  intervalObject['interval'] = interval
  intervalObject['stats'] = {}
  intervalObject.stats.cpu = null
  intervalObject.stats.mem = []
  procIntervals['total'] = intervalObject
}

module.exports = { register, unregister, registerSI }
