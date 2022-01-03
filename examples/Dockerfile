FROM node:16-alpine

ENV NODE_ENV production

RUN addgroup -S app && adduser -D -H -u 1001 -s /bin/bash app -G app \
  && apk update && apk upgrade && apk add --no-cache tini && rm -rf /var/cache/apk/* \
  && npm i -g @entwico/spa-resort \
  && mkdir /data && chown app:app /data \
  && echo '{ "spa": { "staticFilesPath": "/spa" }, "data": { "path": "/data" } }' > /etc/resort.json && chown app:app /etc/resort.json

COPY --chown=app:app dist/ /spa

USER app

ENTRYPOINT ["tini", "--", "spa-resort", "-c", "/etc/resort.json"]

EXPOSE 8080
