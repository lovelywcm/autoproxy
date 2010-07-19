#!/usr/bin/perl

#############################################################################
# This is the release automation script, it will change current extension   #
# version, create release builds and commit it all into Mercurial. Usually  #
# you just want to create a build - use make_devbuild.pl for this.          #
#############################################################################

use strict;

die "Version number not specified" unless @ARGV;

my $version = $ARGV[0];
$version =~ s/[^\w\.]//gs;

open(VERSION, ">version");
print VERSION $ARGV[0];
close(VERSION);

@ARGV = ("../downloads/autoproxy-$version.xpi");
do './create_xpi.pl';

chdir('..');
system("hg add downloads/autoproxy-$version.xpi");
system(qq(hg commit -m "Releasing AutoProxy $version" downloads src));

my $branch = $version;
$branch =~ s/\./_/g;
$branch = "AutoProxy_".$branch."_RELEASE";
system(qq(hg tag $branch));

system(qq(hg push));
