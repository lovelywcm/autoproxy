#!/bin/bash
#
# Since we replaced all 'abp' string with 'aup',
#   it causes problems when we diff these two repositories.
#
# This script is used to handle such problem.
#
# @usage: same as `diff`
# @example: $./apdiff.sh -rBb chrome/content/ ../adblockplus/chrome/content/
# @output: same as `diff` but will ignore lines which diff only because abp/aup
################################################################################

diff $* > temp.diff;

curLineNum=1;
while true
do
  curLine=$(sed -n "$curLineNum{p;q;}" temp.diff);
  if [[ "$curLine" =~ ^\< ]]; then
    FoundNextDiff=false;
    ((nextDiffNum = $curLineNum + 1));

    while true
    do
      nextDiff=$(sed -n "$nextDiffNum{p;q;}" temp.diff);
      if [[ "$nextDiff" =~ ^\> ]]; then
        FoundNextDiff=true;
        nextDiff=${nextDiff/#>/<};
        nextDiff=${nextDiff//abp/aup};
        nextDiff=${nextDiff//ABP/AUP};
        nextDiff=${nextDiff//adblockplus/autoproxy};
        nextDiff=${nextDiff//AdblockPlus/AutoProxy};
        nextDiff=${nextDiff//Adblock Plus/AutoProxy};
        nextDiff=${nextDiff//Adblock/AutoProxy};
        nextDiff=${nextDiff//adblock/AutoProxy};
        if [ "$nextDiff" == "$curLine" ]; then
          sed -i "$nextDiffNum d" temp.diff;
          sed -i "$curLineNum d" temp.diff;
          ((curLineNum--));
          break;
        fi
      elif $FoundNextDiff; then
        break;
      elif [ "$nextDiff" == "" ]; then
        break;
      fi
      ((nextDiffNum++));
    done

  elif [ "$curLine" == "" ]; then # EOF
    break;
  fi

  ((curLineNum++));
done


# remove lines like this:
#   "191c191" followed by "---"
#
# Note:
# `sed` access the newest temp.diff from disk every time,
# 'while read' uses old unmodified temp.diff forever, they are independent.
#
curLineNum=1;
while read curLine
do
  if [[ "$curLine" =~ ^[1-9] ]]; then
    ((nextLineNum = $curLineNum + 1));
    nextLine=$(sed -n "$nextLineNum{p;q;}" temp.diff);
    if [[ "$nextLine" =~ ^---$ ]]; then
      sed -i "$nextLineNum d" temp.diff;
      sed -i "$curLineNum d" temp.diff;
      ((curLineNum -= 2));
    fi
  fi
  ((curLineNum++));
done < temp.diff

# highlight in vim looks better than `echo`
vim temp.diff;
