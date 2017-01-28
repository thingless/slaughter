#!/bin/bash
cd $(dirname $0)
node_modules/.bin/browserify lib/libs.ts --noParse=three --noParse=jquery --ignore-missing --dg=false  -p [ tsify --noImplictAny ] --debug > src/libs.js
node_modules/.bin/browserify lib/index.ts --exclude ws --ignore-missing --dg=false  -p [ tsify --noImplictAny ] --debug > src/bundle.js
node_modules/.bin/browserify lib/aiworker.ts --exclude ws --ignore-missing --dg=false  -p [ tsify --noImplictAny ] --debug > src/aiworker.js
node_modules/.bin/browserify lib/aiplayoff.ts --exclude ws --exclude net --exclude child_process --exclude "colors/safe" --ignore-missing --dg=false  -p [ tsify --noImplictAny ] --debug > src/aiplayoff.js
