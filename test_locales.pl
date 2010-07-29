#!/usr/bin/perl

use strict;

my %paths = (
  aup => 'chrome/locale',
);

my @must_differ = (
  ['aup:overlay:opensidebar.accesskey', 'aup:overlay:settings.accesskey', 'aup:settings:options.accesskey', 'aup:settings:enable.accesskey'],
  ['aup:settings:filters.accesskey', 'aup:settings:edit.accesskey', 'aup:settings:view.accesskey', 'aup:settings:options.accesskey', 'aup:settings:help.accesskey', 'aup:settings:add.accesskey', 'aup:settings:apply.accesskey'],
  ['aup:settings:add.accesskey', 'aup:settings:addsubscription.accesskey', 'aup:settings:synchsubscriptions.accesskey', 'aup:settings:import.accesskey', 'aup:settings:export.accesskey', 'aup:settings:clearall.accesskey', 'aup:settings:resethitcounts.accesskey'],
  ['aup:settings:cut.accesskey', 'aup:settings:copy.accesskey', 'aup:settings:paste.accesskey', 'aup:settings:remove.accesskey', 'aup:settings:menu.find.accesskey', 'aup:settings:menu.findagain.accesskey'],
  ['aup:settings:filter.accesskey', 'aup:settings:slow.accesskey', 'aup:settings:enabled.accesskey', 'aup:settings:hitcount.accesskey', 'aup:settings:lasthit.accesskey', 'aup:settings:sort.accesskey'],
  ['aup:settings:sort.none.accesskey', 'aup:settings:filter.accesskey', 'aup:settings:slow.accesskey', 'aup:settings:enabled.accesskey', 'aup:settings:hitcount.accesskey', 'aup:settings:lasthit.accesskey', 'aup:settings:sort.ascending.accesskey', 'aup:settings:sort.descending.accesskey'],
  ['aup:settings:enable.accesskey', 'aup:settings:showintoolbar.accesskey', 'aup:settings:showinstatusbar.accesskey', 'aup:settings:objecttabs.accesskey'],
  ['aup:settings:gettingStarted.accesskey', 'aup:settings:faq.accesskey', 'aup:settings:filterdoc.accesskey', 'aup:settings:about.accesskey'],
  ['aup:subscription:location.accesskey', 'aup:subscription:title.accesskey', 'aup:subscription:autodownload.accesskey', 'aup:subscription:enabled.accesskey'],
);

my @must_equal = (
  ['aup:overlay:opensidebar.accesskey', 'aup:overlay:closesidebar.accesskey'],
);

my %keepAccessKeys = map {$_ => $_} (
  'ja-JP',
  'ko-KR',
  'zh-CN',
  'zh-TW',
);

my @ignoreUntranslated = (
  qr/\.url$/,
  quotemeta("aup:about:caption.title"),
  quotemeta("aup:about:version.title"),
  quotemeta("aup:global:status_auto_label"),
  quotemeta("aup:global:type_label_document"),
  quotemeta("aup:global:type_label_dtd"),
  quotemeta("aup:global:type_label_ping"),
  quotemeta("aup:global:type_label_script"),
  quotemeta("aup:global:type_label_stylesheet"),
  quotemeta("aup:global:type_label_xbl"),
  quotemeta("aup:global:subscription_status"),
  quotemeta("aup:global:subscription_status_lastdownload_unknown"),
  quotemeta("aup:overlay:status.tooltip"),
  quotemeta("aup:overlay:toolbarbutton.label"),
  quotemeta("aup:settings:filters.label"),
  quotemeta("aup:sidebar:filter.label"),
);

my @locales = sort {$a cmp $b} makeLocaleList();

my $referenceLocale = readLocaleFiles("en-US");

foreach my $locale (@locales)
{
  my $currentLocale = $locale eq "en-US" ? $referenceLocale : readLocaleFiles($locale);

  compareLocales($locale, $currentLocale, $referenceLocale) unless $currentLocale == $referenceLocale;

  foreach my $entry (@must_differ)
  {
    my %values = ();
    foreach my $key (@$entry)
    {
      my ($dir, $file, $name) = split(/:/, $key);
      next unless exists($currentLocale->{"$dir:$file"}) && exists($currentLocale->{"$dir:$file"}{$name});
      my $value = lc($currentLocale->{"$dir:$file"}{$name});

      print "$locale: values for '$values{$value}' and '$key' are identical, must differ\n" if exists $values{$value};
      $values{$value} = $key;
    }
  }

  foreach my $entry (@must_equal)
  {
    my $stdValue;
    my $stdName;
    foreach my $key (@$entry)
    {
      my ($dir, $file, $name) = split(/:/, $key);
      next unless exists($currentLocale->{"$dir:$file"}) && exists($currentLocale->{"$dir:$file"}{$name});
      my $value = lc($currentLocale->{"$dir:$file"}{$name});

      $stdValue = $value unless defined $stdValue;
      $stdName = $key unless defined $stdName;
      print "$locale: values for '$stdName' and '$key' differ, must be equal\n" if $value ne $stdValue;
    }
  }

  foreach my $file (keys %$currentLocale)
  {
    my $fileData = $currentLocale->{$file};
    foreach my $key (keys %$fileData)
    {
      if (($key =~ /\.accesskey$/ || $key =~ /\.key$/) && length($fileData->{$key}) != 1)
      {
        print "$locale: Length of accesskey '$file:$key' isn't 1 character\n";
      }

      if ($key =~ /\.accesskey$/)
      {
        if (exists($keepAccessKeys{$locale}))
        {
          if (exists($referenceLocale->{$file}{$key}) && lc($fileData->{$key}) ne lc($referenceLocale->{$file}{$key}))
          {
            print "$locale: Accesskey '$file:$key' should be the same as in the reference locale\n";
          }
        }
        else
        {
          my $labelKey = $key;
          $labelKey =~ s/\.accesskey$/.label/;
          if (exists($fileData->{$labelKey}) && $fileData->{$labelKey} !~ /\Q$fileData->{$key}/i)
          {
            print "$locale: Accesskey '$file:$key' not found in the corresponding label '$file:$labelKey'\n";
          }
        }
      }

      if ($currentLocale != $referenceLocale && $locale ne "en-GB" && length($fileData->{$key}) > 1 && $fileData->{$key} eq $referenceLocale->{$file}{$key})
      {
        my $ignore = 0;
        foreach my $re (@ignoreUntranslated)
        {
          $ignore = 1 if "$file:$key" =~ $re;
        }
        print "$locale: Value of '$file:$key' is the same as in the reference locale, probably an untranslated string\n" unless $ignore;
      }
    }
  }
}

sub makeLocaleList
{
  return @ARGV if @ARGV;

  my %locales = ();
  foreach my $dir (keys %paths)
  {
    opendir(local* DIR, $paths{$dir}) or die "Could not open directory $paths{$dir}";
    my @locales = grep {!/[^\w\-]/ && !-e("$paths{$dir}/$_/.incomplete")} readdir(DIR);
    $locales{$_} = 1 foreach @locales;
    closedir(DIR);
  }
  return keys %locales;
}

sub readFile
{
  my $file = shift;

  open(local *FILE, "<", $file) || die "Could not read file '$file'";
  binmode(FILE);
  local $/;
  my $result = <FILE>;
  close(FILE);

  print "Byte Order Mark found in file '$file'\n" if $result =~ /\xEF\xBB\xBF/;
  print "File '$file' is not valid UTF-8\n" unless (utf8::decode($result));

  return $result;
}

sub parseDTDFile
{
  my $file = shift;
  
  my %result = ();

  my $data = readFile($file);

  my $S = qr/[\x20\x09\x0D\x0A]/;
  my $Name = qr/[A-Za-z_:][\w.\-:]*/;
  my $Reference = qr/&$Name;|&#\d+;|&#x[\da-fA-F]+;/;
  my $PEReference = qr/%$Name;/;
  my $EntityValue = qr/"((?:[^%&"]|$PEReference|$Reference)*)"|'((?:[^%&']|$PEReference|$Reference)*)'/;

  # Remove comments
  $data =~ s/<!--([^\-]|-[^\-])*-->//gs;

  # Process entities
  while ($data =~ /<!ENTITY$S+($Name)$S+$EntityValue$S*>/gs)
  {
    $result{$1} = $2 || $3;
    $result{$1} =~ s/&apos;/'/g;
  }

  # Remove entities
  $data =~ s/<!ENTITY$S+$Name$S+$EntityValue$S*>//gs;

  # Remove spaces
  $data =~ s/^\s+//gs;
  $data =~ s/\s+$//gs;
  $data =~ s/\s+/ /gs;

  print "Unrecognized data in file '$file': $data\n" if $data ne '';

  return \%result;
}

sub parsePropertiesFile
{
  my $file = shift;

  my %result = ();

  my $data = readFile($file);
  while ($data =~ /^(.*)$/mg)
  {
    my $line = $1;

    # ignore comments
    next if $line =~ /^\s*[#!]/;

    if ($line =~ /=/)
    {
      my ($key, $value) = split(/=/, $line, 2);
      $result{$key} = $value;
    }
    elsif ($line =~ /\S/)
    {
      print "Unrecognized data in file '$file': $line\n";
    }
  }
  close(FILE);

  return \%result;
}

sub readLocaleFiles
{
  my $locale = shift;

  my %result = ();
  foreach my $dir (keys %paths)
  {
    opendir(local *DIR, "$paths{$dir}/$locale") or next;
    foreach my $file (readdir(DIR))
    {
      if ($file =~ /(.*)\.dtd$/)
      {
        $result{"$dir:$1"} = parseDTDFile("$paths{$dir}/$locale/$file");
      }
      elsif ($file =~ /(.*)\.properties$/)
      {
        $result{"$dir:$1"} = parsePropertiesFile("$paths{$dir}/$locale/$file");
      }
    }
    closedir(DIR);
  }

  return \%result;
}

sub compareLocales
{
  my ($locale, $current, $reference) = @_;

  my %hasFile = ();
  foreach my $file (keys %$current)
  {
    unless (exists($reference->{$file}))
    {
      print "$locale: Extra file '$file'\n";
      next;
    }
    $hasFile{$file} = 1;

    my %hasValue = ();
    foreach my $key (keys %{$current->{$file}})
    {
      unless (exists($reference->{$file}{$key}))
      {
        print "$locale: Extra value '$file:$key'\n";
        next;
      }
      $hasValue{$key} = 1;
    }

    foreach my $key (keys %{$reference->{$file}})
    {
      unless (exists($current->{$file}{$key}))
      {
        print "$locale: Missing value '$file:$key'\n";
        next;
      }
    }
  }

  foreach my $file (keys %$reference)
  {
    unless (exists($current->{$file}))
    {
      print "$locale: Missing file '$file'\n";
      next;
    }
  }
}
