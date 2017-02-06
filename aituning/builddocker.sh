#!/bin/bash
set -o errexit
set -o nounset

#get pathing correct
__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
__file="${__dir}/$(basename "${BASH_SOURCE[0]}")"
cd "$__dir"
cd ..

#make sure the source is latest build
echo "building js"
npm run build

#build & push the image
echo "building container"
docker build -t "freethenation/slaughter:latest" .
echo "pushing container"
docker push "freethenation/slaughter:latest"