# SPA Resort

Opinionated server to host single page applications (SPA).

What's inside:

- OIDC support (sessions)
- access / refresh / id tokens are automatically handled
- proxy for services calls (see **security notice** before using it)

What's **not** inside:

- SSL / TLS
- Security headers, such as e.g. provided by npm `helment` library

The above is not included because the application is assumed to run behind a load balancer that should implement it.

## Usage

### Server

Use corresponding docker image as a deployment unit or a reference.

### Local (development)

For development purposes run

```
npm i -D @entwico/spa-resort
```

Then create a config file, e.g. for Angular application it can be

```js
module.exports = {
  server: {
    baseUrl: 'http://localhost:4200',
    port: 4200,
  },
  logs: {
    level: 'debug',
    format: 'simple',
  },
  session: {
    cookie: {
      secure: false,
    },
  },
  spa: {
    proxy: {
      config: {
        '/another-path-to-proxy': { target: process.env.UI_PROXY_CONTELLO_CORE, secure: false, changeOrigin: true },
        '/': { target: 'http://localhost:4200', ws: true, changeOrigin: true },
      },
    },
  },
  oidc: {
    providerUrl: process.env.UI_OIDC_PROVIDER_URL,
    clientId: process.env.UI_CLIENT_ID,
    clientSecret: process.env.UI_CLIENT_SECRET,
  },
}
```

Finally add the script in your package.json:

```
  "start:resort": "spa-resort -c .resortrc.js",
```

### Config

The full config can be found in [default-config.yaml](default-config.yaml) file.

Config can be either .`yaml` or `.json` or `.js` and can be provided with `-c` CLI parameters. Multiple configs are also supported.

### Security notice

The backend services are supposed to check the `Authentication: Bearer ...` header. If this is not the case, please consider to mitigate the CSRF attacks elsehow.

## License 

[MIT](LICENSE)
