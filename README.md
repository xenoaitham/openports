# OpenPorts

Openports is project idreamt of doing so long its Saas for cybersecurity u put ur domain and get if there any vulnerabilty i gope y'll like it 

-----------------------------------------------------

## Run locally

Use Node.js 22.

```sh
npm ci
npm run dev
```

Open <http://localhost:4310>. The development command creates the database and applies migrations before starting the server.

Add a domain, publish the TXT record shown on its page, and check ownership. Scanning starts after verification. `scanme.nmap.org` is the built-in exception for testing.

For a real demo scan:

```sh
npm run seed
```

Results depend on what the target returns. A [screenshot preview](https://xenoaitham.github.io/openports) is also available.


