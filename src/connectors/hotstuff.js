/* Author: Sadok Ben Toumia */
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const fs = require('fs');
const envGen = require('./generate-env');
const { execSync, spawnSync } = require('child_process');
const exec = require('await-exec');
const path = require('path');
const yamlGen = require('./yamlGen.js');
const yaml = require('js-yaml');
const awk = require('awk');
const pidusage = require('pidusage');
let _writeClients = (hotStuffDir, clientString) => {
  fs.writeFileSync(path.join(hotStuffDir, 'scripts/deploy/clients.txt'));
  console.log('Writing clients...');
};
let _populateClis = (nClients) => {
  var clis = new Map();
  for (let i = 0; i < nClients; i++) {
    let ip =
      11 +
      '.' +
      Math.floor(Math.random() * 255) +
      '.' +
      Math.floor(Math.random() * 255) +
      '.' +
      Math.floor(Math.random() * 255);
    clis['hotstuffClient' + i] = ip;
  }
  return clis;
};
let _populateReplicas = (nReplicas) => {
  var reps = new Map();
  for (let i = 0; i < nReplicas; i++) {
    let ip =
      11 +
      '.' +
      Math.floor(Math.random() * 255) +
      '.' +
      Math.floor(Math.random() * 255) +
      '.' +
      Math.floor(Math.random() * 255);
    reps['hotstuffReplica' + i] = ip;
  }
  return reps;
};
let _writeReplicas = (hotStuffDir, replicaString) => {
  fs.writeFileSync(
    path.join(hotStuffDir, 'scripts/deploy/replicas.txt'),
    replicaString,
  );
  console.log('Writing replicas...');
};

let createPeers = (hotStuffDir, replicaMap) => {
  let peerString = '';
  for (const [key, value] of Object.entries(replicaMap)) {
    peerString += value + ' ' + value + '\n';
  }
  console.log('peerString : ' + peerString);
  _writeReplicas(hotStuffDir, peerString);
};

let createClients = (hotStuffDir, clientMap) => {
  let clientString = '';
  for (const [key, value] of Object.entries(clientMap)) {
    clientString += value + ' ' + value + '\n';
  }
  console.log('clientString : ' + clientString);
  _writeClients(hotStuffDir, clientString);
};

let genArtifacts = (hotStuffDir, blockSize) => {
  console.log('Generating artifacts...');
  genScript = execSync('./gen_all.sh ' + blockSize, {
    cwd: path.join(hotStuffDir, '/scripts/deploy/'),
  });
  console.log(genScript.toString());
  console.log('Finished generating artifacts...');
};

let createShadowHostConfigForHotStuff = (hotStuffDir, res, reps, clis) => {
  let i = 0;
  for (const [key, value] of Object.entries(reps)) {
    res = yamlGen.makeHost(
      res,
      key,
      value,
      i,
      path.join(hotStuffDir, '/examples/hotstuff-app'),
      '',
      '--conf ' +
        path.join(
          hotStuffDir,
          '/scripts/deploy/hotstuff.gen-sec' + i + '.conf',
        ),
      '0s',
    );
    ++i;
  }
  i = 0;
  let nodeId = Object.keys(reps).length;
  for (const [key, value] of Object.entries(clis)) {
    res = yamlGen.makeHost(
      res,
      key,
      value,
      nodeId++,
      path.join(hotStuffDir, '/examples/hotstuff-client'),
      '',
      '--idx ' + i + ' --iter -1 --max-async ' + outStandingPerClient,
      '10s',
    );
    ++i;
  }
  return res;
};
let newBuild = (path, reqSize) => {
  console.log('rebuilding hotstuff');
  var cmakeScript = execSync(
    'cmake -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED=ON -DHOTSTUFF_PROTO_LOG=ON "-DCMAKE_CXX_FLAGS=-g -DHOTSTUFF_ENABLE_BENCHMARK -DHOTSTUFF_CMD_RESPSIZE=' +
      reqSize +
      ' -DHOTSTUFF_CMD_REQSIZE=' +
      reqSize +
      '"',
    { cwd: path },
  ).toString();
  console.log(cmakeScript);
  console.log('CMake finished...');
  console.log('make...');
  var makeScript = execSync('make', { cwd: path }).toString();
  console.log(makeScript);
  console.log('Finished generating artifacts...');
};
let copyUtils = (hotStuffDir) => {
  var copyHotStuffConf = execSync(
    'cp ' +
      path.join(hotStuffDir, '/scripts/deploy/hotstuff.gen.conf') +
      ' ' +
      path.join(hotStuffDir, 'hotstuff.conf'),
  ).toString();
  console.log(copyHotStuffConf);
};
async function runExp(hotStuffDir, shadowFile, arg) {
  let b = 0;
  await exec('~/.local/bin/shadow ' + shadowFile + ' &> log.txt', {
    cwd: hotStuffDir,
    maxBuffer: 1024 * 1024 * 1024 * 10,
  });
}
let saveExp = (hotStuffDir, shadowFile, newName) => {
  var saveExp = execSync(
    'cp ' +
      path.join(hotStuffDir, 'log.txt') +
      ' ' +
      path.join(hotStuffDir, newName),
  );
  console.log(saveExp.toString());
};
let getResults = (hotStuffDir, workDir) => {
  let grep = execSync(
    'cat ' +
      path.join(workDir, '/hosts/*/*.stderr | python3 ./scripts/thr_hist.py'),
    { cwd: hotStuffDir },
  );
  let tokens = grep.toString().split('\n');
  let stripped = tokens[0].replace('[', '').replace(']', '');
  let arr = stripped.split(', ');
  let numArr = [];
  arr.forEach((element) => numArr.push(Number(element)));
  let max = -1;
  numArr.forEach((element) => {
    max = element > max ? element : max;
  });
  let latencyString = tokens[1].replace('lat = ', '').replace('ms', '');
  let latency = Number(latencyString);
  let returnVal = { throughput: max, latency: latency };
  return returnVal;
};
let getPids = (name) => {
  let idString = execSync(`ps -ef|grep ${name} | awk {'print $2'}`);
  return idString.toString().split('\n').map(Number);
};

const compute = async (procName, usage) => {
  let pids = getPids(procName);
  const stats = await pidusage(pids);
  let total = 0.0;
  let mem = 0.0;
  Object.keys(stats).forEach(function (key) {
    total += stats[key] == undefined ? 0 : stats[key].cpu;
    mem += stats[key] == undefined ? 0 : stats[key].memory / 1000000000;
  });
  usage.proc = usage.proc > total ? usage.proc : total;
  usage.mem = usage.mem > mem ? usage.mem : mem;
  console.log(procName + ' cpu: ' + total);
  console.log(procName + ' mem: ' + mem);
};
const interval = async (time, procName, usage) => {
  setTimeout(async () => {
    await compute(procName, usage);
    if (!stop) interval(time, procName, usage);
  }, time);
};
let getStats = (appUsage, shadowUsage) => {
  let res = {
    app: { proc: appUsage.proc, mem: appUsage.mem },
    shadow: { proc: shadowUsage.proc, mem: shadowUsage.mem },
  };
  //appUsage.proc.forEach(element => res.app.proc+=(element/appUsage.proc.length));
  //appUsage.mem.forEach(element => res.app.mem+=(element/appUsage.mem.length));
  //shadowUsage.proc.forEach(element => res.shadow.proc +=(element/shadowUsage.proc.length));
  //shadowUsage.mem.forEach(element => res.shadow.mem+=(element/shadowUsage.mem.length));
  return res;
};
var stop = false;
/* Start */
async function main() {
  let args = process.argv.slice();
  let yamlFile = args[2];
  try {
    let expDetails = fs.readFileSync(yamlFile, 'utf8');
    let exp = yaml.load(expDetails);
    var hotStuffDir = exp.hotStuffPath;
    var plots = new Map();
    var renderer = new ChartJSNodeCanvas({
      type: 'svg',
      width: 640,
      height: 360,
    });
    for (let p of exp.plots) {
      plots.set(String(p) + 'Throughput', {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Throughput (Tx/s)',
              data: [],
              fill: false,
              borderColor: 'rgb(75, 192, 192)',
              tension: 0.1,
            },
          ],
        },
        options: {},
        plugins: [
          {
            id: 'background-colour',
            beforeDraw: (chart) => {
              const ctx = chart.ctx;
              ctx.save();
              ctx.fillStyle = 'white';
              ctx.restore();
            },
          },
        ],
      });
      plots.set(String(p) + 'Latency', {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Latency (ms)',
              data: [],
              fill: false,
              borderColor: 'rgb(75, 192, 192)',
              tension: 0.1,
            },
          ],
        },
        options: {},
        plugins: [
          {
            id: 'background-colour',
            beforeDraw: (chart) => {
              const ctx = chart.ctx;
              ctx.save();
              ctx.fillStyle = 'white';
              ctx.restore();
            },
          },
        ],
      });
    }
    console.log('HotStuff dir: ' + hotStuffDir);
    let replicas = (clients = outStandingPerClient = 0);
    for (let experiment of exp.experiments) {
      console.log(experiment);
      replicas = experiment[Object.keys(experiment)[0]].replicas;
      blocksize = experiment[Object.keys(experiment)[0]].blocksize;
      clients = experiment[Object.keys(experiment)[0]].clients;
      outStandingPerClient =
        experiment[Object.keys(experiment)[0]].outstandingPerClient;
      filePath = experiment[Object.keys(experiment)[0]].shadowFile;
      bandwidth = experiment[Object.keys(experiment)[0]].bandwidth;
      latency = experiment[Object.keys(experiment)[0]].latency;
      gmlPath = experiment[Object.keys(experiment)[0]].gmlPath;
      reqSize = experiment[Object.keys(experiment)[0]].reqSize;
      newBuild(hotStuffDir, reqSize);
      console.log(
        'Current config:\n#Replicas:' +
          replicas +
          '\n#Clients:' +
          clients +
          '\nOutstanding Per Client:' +
          outStandingPerClient,
      );
      const reps = _populateReplicas(replicas);
      const clis = _populateClis(clients);
      createPeers(hotStuffDir, reps);
      createClients(hotStuffDir, clis);
      genArtifacts(hotStuffDir, blocksize);
      let res = yamlGen.makeConfigTemplate(
        gmlPath,
        path.join(hotStuffDir, Object.keys(experiment)[0]),
      );
      res = createShadowHostConfigForHotStuff(hotStuffDir, res, reps, clis);
      yamlGen.out(path.join(hotStuffDir, filePath), res);
      let totalNumberOfHosts =
        Object.keys(reps).length + Object.keys(clis).length;
      console.log('Total Number of Hosts:' + totalNumberOfHosts);
      let myGraph = envGen.createGraphSimple(
        Object.keys(reps).length,
        Object.keys(clis).length,
        bandwidth,
        bandwidth,
        latency,
        '0.0',
      );
      fs.writeFileSync(path.join(hotStuffDir, gmlPath), myGraph);
      copyUtils(hotStuffDir);
      var appUsage = { proc: 0.0, mem: 0.0 };
      var shadowUsage = { proc: 0.0, mem: 0.0 };
      var hotStuffTimer;
      stop = false;
      interval(1000, 'hotstuff-app', appUsage);
      var shadowTimer;
      interval(1000, 'shadow', shadowUsage);
      await runExp(hotStuffDir, filePath, Object.keys(experiment)[0]);
      stop = true;
      var sv = saveExp(hotStuffDir, filePath, Object.keys(experiment)[0]);
      let stats = getStats(appUsage, shadowUsage);
      //      console.log('DOOONE');
      console.log('STAATS: ' + JSON.stringify(stats));
      fs.writeFileSync(
        path.join(hotStuffDir, Object.keys(experiment)[0], 'stats.txt'),
        JSON.stringify(stats),
      );
      let results = getResults(hotStuffDir, Object.keys(experiment)[0]);
      for (let p of experiment[Object.keys(experiment)[0]].plots) {
        plots.get(String(p) + 'Throughput').data.datasets[0].data.push({
          x: Object.keys(experiment)[0],
          y: results.throughput,
        });
        plots.get(String(p) + 'Latency').data.datasets[0].data.push({
          x: Object.keys(experiment)[0],
          y: results.latency,
        });
      }
      //      tpsData.push({Object.keys(experiment)[0]: results.throughput});
      //      latData.push({Object.keys(experiment)[0]: results.latency});
    }
    for (const [key, value] of plots) {
      const buffer = renderer.renderToBufferSync(value);
      fs.writeFileSync('./' + key + '.svg', buffer, 'base64');
    }
    console.log(exp);
  } catch (e) {
    console.log(e);
  }
}

main();