#!/bin/bash
set -o errexit
set -o nounset

#if [ "$#" -eq 0 ] ; then
#  echo "Usage: step3_buildDockerContainer.sh tiles_dir"
#  exit 1
#fi

#get pathing correct
__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
__file="${__dir}/$(basename "${BASH_SOURCE[0]}")"
cd "$__dir"
cd ..

#build & push the image
docker build -t "freethenation/slaughter:latest" .
docker push "freethenation/slaughter:latest"