# Shadow Experiments
Steps : 

- cd into BFT-SMaRT

- Build BFT-SMaRT the usual way. 

- run `shadow bftsmart.yaml` 

Current configured hosts are 11.0.0.1-4 in `config/hosts.config`

You can set individual ip addresses for your shadow hosts in bftsmart.yaml.

Watch out for paths. Without the `experimental.use_legacy_working_dir` paths in `args` are relative to the host's working directory which is `shadow.data/YOUR_HOSTNAME` therefore, hardcoded paths in source code will cause errors.

