/* Author: Sadok Ben Toumia */
const fs = require('fs');
const envGen = require('./generate-env')
const {exec} = require('child_process');
const path = require('path');
const yamlGen = require('./yamlGen.js')

let _writeClients = (clientString) => {
    fs.writeFile(path.join(hotStuffDir,'scripts/deploy/clients.txt'), clientString, function (err) {
    if (err) return console.log(err);
    });
   console.log('Writing clients...')
}
let _populateClis = (nClients) => {
    var clis = new Map();
    for(let i=0; i < nClients ;i++) {
        let ip = 11+"."+(Math.floor(Math.random() * 255))+"."+(Math.floor(Math.random() * 255))+"."+(Math.floor(Math.random() * 255));
        clis["hotstuffClient"+i] = ip;
    }
    return clis;
}
let _populateReplicas = (nReplicas)  => {
    var reps = new Map();
    for(let i=0; i < nReplicas ;i++) {
        let ip = 11+"."+(Math.floor(Math.random() * 255))+"."+(Math.floor(Math.random() * 255))+"."+(Math.floor(Math.random() * 255));
        reps["hotstuffReplica"+i] = ip;
    }
    return reps;
}
let _writeReplicas = (replicaString) => {
    fs.writeFile(path.join(hotStuffDir,'scripts/deploy/replicas.txt'), replicaString, function (err) {
    if (err) return console.log(err);
    });
   console.log('Writing replicas...')
}

let createPeers = (replicaMap) => {
    let peerString = ''
    for(const [key,value] of Object.entries(replicaMap)) {
        peerString += value + ' '+ value +'\n';
    }
    console.log('peerString : '+peerString)
    _writeReplicas(peerString)    
}

let createClients = (clientMap) => {
    let clientString = ''
    for(const[key,value] of Object.entries(clientMap)) {
        clientString += value+' '+ value +'\n';
    }
    console.log('clientString : '+clientString)
    _writeClients(clientString)
}

let genArtifacts = () => {
    console.log('Generating artifacts...');
    const { exec } = require('child_process');
    var genScript = exec('sh '+path.join(hotStuffDir,'scripts/deploy/gen_all.sh'),
            (error, stdout, stderr) => {
                console.log(stdout);
                console.log(stderr);
                if (error !== null) {
                    console.log(`exec error: ${error}`);
                }
            });
    console.log('Finished generating artifacts...');
}

let createShadowHostConfigForHotStuff = (res,reps, clis) => {
    let i=0;
    for (const[key, value] of Object.entries(reps)) {
      res = yamlGen.makeHost(res,key, value,i,'./examples/hotstuff-app', '', '--conf ./scripts/deploy/hotstuff.gen-sec'+i+'.conf' , '3s');
      ++i;
    }
    i=0;
    let nodeId = Object.keys(reps).length;
    for (const[key, value] of Object.entries(clis)) {
      res = yamlGen.makeHost(res,key, value,nodeId++,'./examples/hotstuff-client','', '--idx '+i+' --iter -1 --max-async '+ outStandingPerClient, '10s')
      ++i;
    }
    return res;
};

let args = process.argv.slice();
console.log('Launching with args:' + args);
let replicas = clients = outStandingPerClient = 0;
let hotStuffDir = args[2];
replicas = args[3];
clients = args[4];
outStandingPerClient = args[5];
filePath = args[6];
gmlPath = args[7];
const reps = _populateReplicas(replicas);
const clis = _populateClis(clients);
console.log(reps);
console.log(clis);
console.log("Current config:\n#Replicas:"+replicas+ "\n#Clients:"+clients+"\nOutstanding Per Client:"+outStandingPerClient)
createPeers(reps)
createClients(clis);
//genArtifacts();
//let shadowConf = fs.writeFileSync('shadow_host_' + replicas +'.conf', myShadowConf);
let res = yamlGen.makeConfigTemplate(gmlPath);
res = createShadowHostConfigForHotStuff(res,reps, clis);
yamlGen.out(filePath,res);
let totalNumberOfHosts = Object.keys(reps).length+Object.keys(clis).length;
console.log(totalNumberOfHosts);
let myGraph = envGen.createGraphSimple(totalNumberOfHosts, '10 Gbit', '10 Gbit', 1, '0.0');
fs.writeFileSync(gmlPath, myGraph);
