package Packager;

use strict;
use warnings;

sub new
{
  my ($class, $params) = @_;

  unless (exists($params->{build}))
  {
    $params->{build} = `git describe --tags`;
    $params->{build} =~ s/\W//gs;
  }

  my $self = bless($params, $class);

  return $self;
}

sub readVersion
{
  my ($self, $versionFile) = @_;

  open(local *FILE, $versionFile) or die "Could not open version file $versionFile";
  $self->{version} = <FILE>;
  $self->{version} =~ s/[^\w\.]//gs;
  if (exists $self->{devbuild})
  {
    $self->{version} .= ".0" while ($self->{version} =~ tr/././ < 2);
    $self->{version} .= $self->{devbuild};
  }
  close(FILE);
}

sub readLocales
{
  my ($self, $localesDir, $includeIncomplete) = @_;

  opendir(local *DIR, $localesDir) or die "Could not open locales directory $localesDir";
  my @locales = grep {!/[^\w\-]/ && ($includeIncomplete || !-e("$localesDir/$_/.incomplete"))} readdir(DIR);
  closedir(DIR);
  
  @locales = sort {$a eq "en-US" ? -1 : ($b eq "en-US" ? 1 : $a cmp $b)} @locales;

  $self->{locales} = \@locales;
}

sub rm_rec
{
  my ($self, $dir) = @_;

  opendir(local *DIR, $dir) or return;
  foreach my $file (readdir(DIR))
  {
    if ($file =~ /[^.]/)
    {
      if (-d "$dir/$file")
      {
        $self->rm_rec("$dir/$file");
      }
      else
      {
        unlink("$dir/$file");
      }
    }
  }
  closedir(DIR);

  rmdir($dir);
}

sub cp
{
  my ($self, $fromFile, $toFile, $exclude) = @_;

  if ($exclude)
  {
    foreach my $file (@$exclude)
    {
      return if index($fromFile, $file) >= 0;
    }
  }

  my $textMode = ($fromFile =~ /\.(manifest|xul|js|xml|xhtml|rdf|dtd|properties|css)$/);
  my $extendedTextMode = ($fromFile =~ /\.(?:js|rdf|manifest)$/);

  open(local *FROM, $fromFile) or return;
  open(local *TO, ">$toFile") or return;
  binmode(TO);
  if ($textMode)
  {
    print TO map {
      s/\r//g;
      s/^((?:  )+)/"\t" x (length($1)\/2)/e;
      s/\{\{VERSION\}\}/$self->{version}/g if $extendedTextMode;
      s/\{\{BUILD\}\}/$self->{build}/g if $extendedTextMode;
      if ($extendedTextMode && /\{\{LOCALE\}\}/)
      {
        my $loc = "";
        for my $locale (@{$self->{locales}})
        {
          my $tmp = $_;
          $tmp =~ s/\{\{LOCALE\}\}/$locale/g;
          $loc .= $tmp;
        }
        $_ = $loc;
      }

      $_ = $self->{postprocess_line}->($fromFile, $_) if exists $self->{postprocess_line};

      $_;
    } <FROM>;
  }
  else
  {
    local $/;
    binmode(FROM);
    print TO <FROM>;
  }

  $self->{postprocess_file}->($fromFile, *TO) if exists $self->{postprocess_file};

  close(TO);
  close(FROM);
}

sub cp_rec
{
  my ($self, $fromDir, $toDir, $exclude) = @_;

  if ($exclude)
  {
    foreach my $file (@$exclude)
    {
      return if index($fromDir, $file) >= 0;
    }
  }

  my @files;
  if ($fromDir =~ /\blocale$/ && exists $self->{locales})
  {
    @files = @{$self->{locales}};
  }
  else
  {
    opendir(local *DIR, $fromDir) or return;
    @files = readdir(DIR);
    closedir(DIR);
  }

  $self->rm_rec($toDir);
  mkdir($toDir);
  foreach my $file (@files)
  {
    if ($file =~ /[^.]/)
    {
      if (-d "$fromDir/$file")
      {
        $self->cp_rec("$fromDir/$file", "$toDir/$file", $exclude);
      }
      else
      {
        $self->cp("$fromDir/$file", "$toDir/$file", $exclude);
      }
    }
  }
}

sub createFileDir
{
  my ($self, $fileName) = @_;

  my @parts = split(/\/+/, $fileName);
  pop @parts;

  my $dir = '.';
  foreach my $part (@parts)
  {
    $dir .= '/' . $part;
    mkdir($dir);
  }
}

sub fixZipPermissions
{
  my ($self, $fileName) = @_;
  my $invalid = 0;
  my($buf, $entries, $dirlength);

  open(local *FILE, "+<", $fileName) or ($invalid = 1);
  unless ($invalid)
  {
    seek(FILE, -22, 2);
    sysread(FILE, $buf, 22);
    (my $signature, $entries, $dirlength) = unpack("Vx6vVx6", $buf);
    if ($signature != 0x06054b50)
    {
      print STDERR "Wrong end of central dir signature!\n";
      $invalid = 1;
    }
  }
  unless ($invalid)
  {
    seek(FILE, -22-$dirlength, 2);
    for (my $i = 0; $i < $entries; $i++)
    {
      sysread(FILE, $buf, 46);
      my ($signature, $namelen, $attributes) = unpack("Vx24vx8V", $buf);
      if ($signature != 0x02014b50)
      {
        print STDERR "Wrong central file header signature!\n";
        $invalid = 1;
        last;
      }
      my $attr_high = $attributes >> 16;
      $attr_high = ($attr_high & ~0777) | ($attr_high & 040000 ? 0755 : 0644);
      $attributes = ($attributes & 0xFFFF) | ($attr_high << 16);
      seek(FILE, -8, 1);
      syswrite(FILE, pack("V", $attributes));
      seek(FILE, 4 + $namelen, 1);
    }
  }
  close(FILE);

  unlink $fileName if $invalid;
}

sub makeJAR
{
  my ($self, $jarFile, @files) = @_;

  $self->rm_rec('tmp');
  unlink($jarFile);

  mkdir('tmp');

  my @include = ();
  my @exclude = ();
  foreach my $file (@files)
  {
    if ($file =~ s/^-//)
    {
      push @exclude, $file;
    }
    else
    {
      push @include, $file;
    }
  }

  foreach my $file (@include)
  {
    if (-d $file)
    {
      $self->cp_rec($file, "tmp/$file", \@exclude);
    }
    else
    {
      $self->cp($file, "tmp/$file", \@exclude);
    }
  }

  chdir('tmp');
  $self->fixLocales();
  print `zip -rX0 $jarFile @include`;
  chdir('..');

  rename("tmp/$jarFile", "$jarFile");
  
  $self->rm_rec('tmp');
}

sub fixLocales()
{
  my $self = shift;

  # Add missing files
  opendir(local *DIR, "locale/en-US") or return;
  foreach my $file (readdir(DIR))
  {
    next if $file =~ /^\./;

    foreach my $locale (@{$self->{locales}})
    {
      next if $locale eq "en-US";

      if (-f "locale/$locale/$file")
      {
        if ($file =~ /\.dtd$/)
        {
          $self->fixDTDFile("locale/$locale/$file", "locale/en-US/$file");
        }
        elsif ($file =~ /\.properties$/)
        {
          $self->fixPropertiesFile("locale/$locale/$file", "locale/en-US/$file");
        }
      }
      else
      {
        $self->cp("locale/en-US/$file", "locale/$locale/$file");
      }
    }
  }
  closedir(DIR);

  # Remove extra files
  foreach my $locale (@{$self->{locales}})
  {
    next if $locale eq "en-US";

    opendir(local *DIR, "locale/$locale") or next;
    foreach my $file (readdir(DIR))
    {
      next if $file =~ /^\./;

      unlink("locale/$locale/$file") unless -f "locale/en-US/$file";
    }
    closedir(DIR);
  }
}

my $S = qr/[\x20\x09\x0D\x0A]/;
my $Name = qr/[A-Za-z_:][\w.\-:]*/;
my $Reference = qr/&$Name;|&#\d+;|&#x[\da-fA-F]+;/;
my $PEReference = qr/%$Name;/;
my $EntityValue = qr/"(?:[^%&"]|$PEReference|$Reference)*"|'(?:[^%&']|$PEReference|$Reference)*'/;

sub fixDTDFile
{
  my ($self, $file, $referenceFile) = @_;

  my $data = $self->readFile($file);
  my $reference = $self->readFile($referenceFile);

  my $changed = 0;
  $data .= "\n" unless $data =~ /\n$/s;
  while ($reference =~ /<!ENTITY$S+($Name)$S+$EntityValue$S*>/gs)
  {
    my ($match, $name) = ($&, $1);
    unless ($data =~ /<!ENTITY$S+$name$S+$EntityValue$S*>/s)
    {
      $data .= "$match\n";
      $changed = 1;
    }
  }

  $self->writeFile($file, $data) if $changed;
}

sub fixPropertiesFile
{
  my ($self, $file, $referenceFile) = @_;

  my $data = $self->readFile($file);
  my $reference = $self->readFile($referenceFile);

  my $changed = 0;
  $data .= "\n" unless $data =~ /\n$/s;
  while ($reference =~ /^\s*(?![!#])(\S+)\s*=\s*.+$/mg)
  {
    my ($match, $name) = ($&, $1);
    unless ($data =~ /^\s*(?![!#])($name)\s*=\s*.+$/m)
    {
      $data .= "$match\n";
      $changed = 1;
    }
  }

  $self->writeFile($file, $data) if $changed;
}

sub readFile
{
  my ($self, $file) = @_;

  open(local *FILE, "<", $file) || return undef;
  binmode(FILE);
  local $/;
  my $result = <FILE>;
  close(FILE);

  return $result;
}

sub writeFile
{
  my ($self, $file, $contents) = @_;

  open(local *FILE, ">", $file) || return;
  binmode(FILE);
  print FILE $contents;
  close(FILE);
}

sub makeXPI
{
  my ($self, $xpiFile, @files) = @_;

  $self->rm_rec('tmp');
  unlink($xpiFile);

  mkdir('tmp');

  foreach my $file (@files)
  {
    if (-d $file)
    {
      $self->cp_rec($file, "tmp/$file");
    }
    else
    {
      $self->createFileDir("tmp/$file");
      $self->cp($file, "tmp/$file");
    }
  }

  if (-f 'sign.pl')
  {
    system($^X, 'sign.pl', 'tmp',  'temp_xpi_file.xpi');
  }
  else
  {
    chdir('tmp');
    print `zip -rDX ../temp_xpi_file.xpi @files`;
    chdir('..');
  }

  $self->fixZipPermissions("temp_xpi_file.xpi") if $^O =~ /Win32/i;
  
  rename("temp_xpi_file.xpi", $xpiFile);

  $self->rm_rec('tmp');
}

1;
