#!/bin/sh

set -e
/usr/local/bin/runtime-injection.sh dev
exec npm start
