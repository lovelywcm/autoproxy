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
 * Wang Congming <lovelywcm@gmail.com>.
 *
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK ***** */

var aup = Components.classes["@mozilla.org/autoproxy;1"]
                          .createInstance().wrappedJSObject;
var prefs = aup.prefs;
var subscriptions = aup.filterStorage.subscriptions;

var curDefaultProxy = prefs.defaultProxy;
var proxies = prefs.customProxy.split("$");
if (proxies == "") proxies = prefs.knownProxy.split("$");

let globalPrimary;

let cE = function(tag) { return document.createElementNS(
		 "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", tag); };

function init()
{
  // insert menu items to global primary proxy menu list
  globalPrimary = document.getElementById("globalPrimary");
  for each (let proxy in proxies) {
    if (proxy == "") continue;
    var mitem = cE("menuitem");
    mitem.setAttribute("label", proxy.split(";")[0]);
    globalPrimary.firstChild.appendChild(mitem);
    if (proxy == curDefaultProxy) globalPrimary.selectedItem = mitem;
  }

  // one row per group
  var rows = document.getElementsByTagName("rows")[0];
  for each (let subscription in subscriptions) {
    if ( subscription.url != "~il~" && subscription.url != "~wl~" ) {
      var row = cE("row");
      var label = cE("label");
      var primaryBtn = cE("menulist");
      var SecondaryBtn = cE("menulist");
      var checkbox = cE("checkbox");
      label.setAttribute("value", subscription.title);

      // still under development
      label.setAttribute("disabled", "true");
      primaryBtn.setAttribute("disabled", "true");
      SecondaryBtn.setAttribute("disabled", "true");
      checkbox.setAttribute("disabled", "true");

      row.appendChild(label);
      row.appendChild(primaryBtn);
      row.appendChild(SecondaryBtn);
      row.appendChild(checkbox);
      rows.appendChild(row);
    }
  }
}

function saveChosen()
{
  var selectedProxy = proxies[globalPrimary.selectedIndex];
  if ( selectedProxy != curDefaultProxy ) {
    prefs.defaultProxy = selectedProxy;
    prefs.save();
    aup.policy.readDefaultProxy();
  }
}
