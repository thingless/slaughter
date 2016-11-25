#!/bin/bash
cd $(dirname $0)
node_modules/.bin/browserify lib/libs.ts  -p [ tsify --noImplictAny ] --debug > src/libs.js
node_modules/.bin/browserify lib/index.ts  -p [ tsify --noImplictAny ] --debug > src/bundle.js
