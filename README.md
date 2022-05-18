### Shadow Experiments

# Building

first clone this repo then run:

`cd shadow-experiments && git submodule update --init --recursive && cd src && npm install`

to start an experiment you have to pass an experiment description file to the orchestrator. For BFT-SMaRt experiments
see example/example.yaml.

NOTE: If you are planning on using example.yaml, change the experimentsDirectory as it is pointing to my root in the VM

example:

`node orchestrator.js examples/example.yaml`



# If you want to make a connector for another protocol

Your connector has to have the methods `build` and `configure` (see orchestrator.js)
Experiment description files have to adhere to a certain format:

```
protocolName: name of your protocol
protocolPath: path to your protocol (will be used to run build commands)
executionDir: path to put in your shadow files
experimentsDirectory: path to save in your experiments
experiments: Array describing the experiments to be made
    exp1: description of an experiment
        misc: miscelleanous settings 
            duration: duration of the experiment
            clientDelay: timeport to start client
            useShortestPath: whether to Dijkstra
            parallelism: you know :)
        network:
            bandwidthUp: ..
            bandwidthDown: ..
            latency:
                uniform: (true|false)
                if true:
                    delay: ...
                else:
                    hosts: Array  describing AWS hosts format region: host
        replica: 
            This is for protocol-specific and replica-specific configurations, this will be passed to 
            your connector.
        client:
            This is for protocol-specific and replica-specific configurations, this will be passed to 
            your connector.
```



## Outdated
Steps : 

- cd into BFT-SMaRT

- Build BFT-SMaRT the usual way. 

- run `shadow bftsmart.yaml` 

Current configured hosts are 11.0.0.1-4 in `config/hosts.config`

You can set individual ip addresses for your shadow hosts in bftsmart.yaml.

Watch out for paths. Without the `experimental.use_legacy_working_dir` paths in `args` and in the source code are relative to the host's working directory which is `shadow.data/YOUR_HOSTNAME` therefore, hardcoded paths in source code will cause errors.

for some reason, h3 is ALWAYS the first to boot up and h4 is the only host that does not display the TCPNODELAY and "Protocol not available" errors.
