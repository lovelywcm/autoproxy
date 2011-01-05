/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is AutoProxy.
 *
 * The Initial Developer of the Original Code is
 * slimx <slimxfir@gmail.com>
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * 2011: Wang Congming <lovelywcm@gmail.com>.
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * @TODO
 */

var menuList = inputTitle = subscription = null, isCreate = true;

function init()
{
  menuList = E("proxyMenu");
  inputTitle = E("groupName");
  proxy.getName.forEach(function(proxyName,index)
  {
    let menuItem = cE('menuitem');
    menuItem.setAttribute('label', proxyName);
    menuItem.setAttribute('value', index);
    menuList.firstChild.appendChild(menuItem);
  });

  if (window.arguments&&window.arguments[0]) {
    isCreate = false;
    subscription = window.arguments[0];
    inputTitle.value = subscription.title;
    menuList.selectedIndex = subscription.proxyIndex; //is right?
  }
  else menuList.selectedIndex = 0;
}

function save()
{
  let title = inputTitle.value;
  let proxyIndex = menuList.selectedIndex;
  if (title.match(/^\s*$/)) return false;

  if(isCreate) {
    let point = prefs.customSubscriptionsPoint++;
    prefs.save();

    if (point == 0) point = "";
    let url = "~fl" + point + "~";
    let subscription = new aup.SpecialSubscription(url, title, proxyIndex);
    filterStorage.addSubscription(subscription);
  }
  else {
    if (subscription.title == title && subscription.proxyIndex == proxyIndex) return;
    subscription.title = title;
    subscription.proxyIndex = proxyIndex;
  }
}
