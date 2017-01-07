#!/bin/bash
if [[ $# -eq 0 ]] ; then
    echo 'usage: startrabbit.sh {password}'
    exit 1
fi
docker pull rabbitmq:3.6.6-management
docker run -e RABBITMQ_DEFAULT_USER=user -e RABBITMQ_DEFAULT_PASS=$1 -p 15672:15672 rabbitmq:3.6.6-management