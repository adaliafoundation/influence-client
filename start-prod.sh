#!/bin/sh

set -e
/usr/local/bin/runtime-injection.sh prod
exec node server.built.js
