# Shadow Experiments

We recommend Ubuntu 20.04 LTS and Shadow v2.2 (newest version as of time of writing)

### Compatibility (tested but no gurantees are given)

**HotStuff**:

- **Arch with Kernel 5.18.5-arch1-1 with GLIBC 2.35:** Working :rocket:
- **Ubuntu 22.04:** Working but not throughly tested :rocket:
- **Ubuntu 20.10:** Working (albeit the Shadow 2.0 does not) :anguished:
- **Ubuntu 18.04:** NOT working (due to GLIBC 2.27) :anguished:
- **Debian 10:** NOT Working  :anguished:
- **Debian 11:** Shadow does NOT pass determinism tests :anguished:

**BFT-SMaRt**:
- **Arch with Kernel 5.18.5-arch1-1 with GLIBC 2.35:** ONLY basic simulations working :rocket:
- **Ubuntu 20.10:** Working (albeit the Shadow 2.0 does not)  :anguished:
- **Ubuntu 18.04:** ONLY basic simulations working :rocket:
- **Debian 10:** NOT Working :anguished:
- **Debian 11:** Shadow does NOT pass determinism tests :anguished:

**Themis**:

- **Arch with Kernel 5.18.5-arch1-1 with GLIBC 2.35:** NOT working (Shadow v2.0 issues other Shadow versions have rseq error) :anguished:

### Dependencies

**Node version (16.3.0):** 

```
curl -sL https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.0/install.sh -o install_nvm.sh

bash install_nvm.sh

export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
  [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

nvm install 16.3.0

```

**Shadow:**


Ubuntu:

```
 apt-get install -y \
    cmake \
    findutils \
    libc-dbg \
    libglib2.0-0 \
    libglib2.0-dev \
    make \
    python3 \
    python3-pip \
    xz-utils \
    util-linux \
    gcc \
    g++ 

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

apt-get install -y \
    python3-numpy \
    python3-lxml \
    python3-matplotlib \
    python3-networkx \
    python3-scipy \
    python3-yaml

apt-get install -y \
    dstat \
    git \
    htop \
    tmux

```


**HotStuff:**

Ubuntu:


```
apt-get install libssl-dev libuv1-dev cmake make libtool autoreconf

```

Ubuntu: ( at least 20.04 ?) additionally:

```
sudo apt-get install libtool autoconf

```



### Building, and Getting started :-)


First, install Shadow v2.2, for details on this, we refer to https://github.com/shadow/shadow

```
$ ./setup build --clean --test
$ ./setup test
$ ./setup install
```

After installing Shadow, it is imporant for the orchestrator to add it to your PATH:

```
echo 'export PATH="${PATH}:/home/${USER}/.local/bin"' >> ~/.bashrc && source ~/.bashrc
```

Now it is time, to clone this repository:


```
cd shadow-experiments && git submodule update --init --recursive && npm install

```

We should test now if building, works, try out In shadow-experiments/libhotstuff:
```
cmake -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED=ON -DHOTSTUFF_PROTO_LOG=ON
make
```

To start an experiment you have to pass an experiment description file to the orchestrator. See ``examples/[ProtocolName].yaml``.

IMPORTANT: rename .env.example to .env and change the placeholders with the appropriate directories.

Once this is completed you can start the simulation, passing the experiment description file like this :


```
npm run simulation -- examples/hs3-aws.yaml
```

HINT: Use ``tmux`` to run your simulations in the background


### If you want to make a connector for another protocol

Your connector has to implement the methods `build` and `configure` (see orchestrator.js)

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
