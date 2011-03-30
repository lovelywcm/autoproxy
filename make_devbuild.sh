#!/bin/bash

################################################################################
#                                                                              #
# make a dev build...                                                          #
#                                                                              #
################################################################################

# read from install.rdf
# assume that "em:version" is located at line 9
# if not, update the value of NR accordingly as below
version=$(awk -F '>|<' 'NR==9 {printf $3}' install.rdf)

# add timestamp to every dev build, so that they are distinguishable
timestamp=$(date +%Y%m%d%H)
versionPlusTimestamp=$version"."$timestamp

sed -i "s/em:version.*/em:version>$versionPlusTimestamp<\/em:version>/" install.rdf
sed -i "s/{{VERSION}}/$versionPlusTimestamp/" components/AutoProxy.js

zip -r autoproxy-$versionPlusTimestamp.xpi chrome components defaults install.rdf chrome.manifest icon.png

sed -i "s/em:version.*/em:version>$version<\/em:version>/" install.rdf
sed -i "s/$versionPlusTimestamp/{{VERSION}}/" components/AutoProxy.js
