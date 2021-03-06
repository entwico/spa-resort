module.exports = {
  server: {
    behindProxy: false,
  },
  logs: {
    level: 'http',
    format: 'simple',
  },
  session: {
    secret: 'some-secret',
    cookie: {
      secure: false,
    },
  },
  spa: {
    staticFilesPath: './dev/spa',
    proxy: {
      config: {
        '/example': { target: 'http://example.com', secure: false, changeOrigin: true }
      },
    },
  },
  oidc: {
    providerUrl: process.env.RESORT_OIDC_PROVIDER_URL,
    audience: 'test-aud',
    clientId: process.env.RESORT_CLIENT_ID,
    clientSecret: process.env.RESORT_CLIENT_SECRET,
  },
}
