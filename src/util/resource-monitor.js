const pidusage = require('pidusage');
const util = require('util');
const { median } = require('./helpers');
const exec = util.promisify(require('node:child_process').exec);

const procIntervals = new Map();

async function getPids(processName){
 let result = await exec(`pidof ${processName}`);
 return result.stdout.toString().split(' ').map(Number);
}

async function compute(processName, log) {
  let pids = await getPids(processName);
  pidusage(pids, function (err, stats) {
    let cputotal = 0.0;
    let mem = 0.0
    Object.keys(stats).forEach(function(key) {
      cputotal+= (stats[key] == undefined)? 0:stats[key].cpu;
      mem+= (stats[key] == undefined)? 0:stats[key].memory/1000000000;
    });    
    log.info(`current cpu usage of ${processName} process: ${cputotal}`);
    log.info(`current mem usage of ${processName} process: ${mem}`);
    procIntervals[processName].stats.cpu.push(cputotal);
    procIntervals[processName].stats.mem.push(mem);
  })
}
async function register(processName, time, log) {
  let interval = setInterval(async function() {
    await compute(processName, log)
  }, time)
  let intervalObject = {};
  intervalObject['interval'] = interval;
  intervalObject['stats'] = {};
  intervalObject.stats.cpu = [];
  intervalObject.stats.mem = [];
  procIntervals[processName] =  intervalObject;
}
async function unregister(log) {
    log.info('clearing intervals ...')
    let usage = {};
    for(let proc in procIntervals)
    {
          clearInterval(procIntervals[proc].interval);
          usage[proc] = {};
          usage[proc].medianCPU = median(procIntervals[proc].stats.cpu);
          usage[proc].medianMEM = median(procIntervals[proc].stats.mem);
          procIntervals.delete(proc);
    }
    log.info('intervals cleared!');
    return usage;
}

module.exports = {register, unregister}
