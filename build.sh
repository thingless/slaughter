#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
$DIR/node_modules/.bin/browserify $DIR/src/index.ts  -p [ tsify --noImplictAny ] --debug > bundle.js
