FROM node:22-bookworm-slim AS node-runtime
FROM python:3.12-slim-bookworm
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/lib/x86_64-linux-gnu/libstdc++.so.6* /usr/lib/x86_64-linux-gnu/
WORKDIR /app
# No dependency network access during the build: use the already installed,
# locked runtime dependency. Python/getconf are in this base image.
COPY package.json ./
COPY node_modules/json-canonicalize ./node_modules/json-canonicalize
COPY src ./src
COPY examples ./examples
COPY independent ./independent
RUN python3 --version && getconf CLK_TCK && chmod -R a+rX /app && mkdir /state && chmod 1777 /state
USER 11001:11001
CMD ["node", "--experimental-strip-types", "src/useful_work/cli_field_002.ts"]
