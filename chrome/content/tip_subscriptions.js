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
 * The Original Code is Adblock Plus.
 *
 * The Initial Developer of the Original Code is
 * Wladimir Palant.
 * Portions created by the Initial Developer are Copyright (C) 2006-2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Wang Congming Modified for AutoProxy.
 * 
 * ***** END LICENSE BLOCK ***** */

let aup = Components.classes["@mozilla.org/autoproxy;1"].createInstance().wrappedJSObject;
let prefs = aup.prefs;

let autoAdd;
let result;
let defaultLabel;
let proxies;
let selectedId;
let E = function(id) { return document.getElementById(id); };

function init()
{
  autoAdd = !(window.arguments && window.arguments.length);
  result = (autoAdd ? {disabled: false, external: false, autoDownload: true} : window.arguments[0]);
  E("description-par1").hidden = !autoAdd;
  E("description-par3").hidden = !autoAdd;
  if (!autoAdd) {
    E("description-par2").style.visibility = "hidden";
    E("defaultButton").style.visibility = "hidden";
    E("acceptButton").label = E("acceptButton").getAttribute("label2");
    E("acceptButton").setAttribute("accesskey", E("acceptButton").getAttribute("accesskey2"));
  }
  else{
    E("aupTipSubscriptions").width = "600px";
    document.title = E("aupTipSubscriptions").getAttribute("welcome");

    selectedId = 0;
    proxies = prefs.defaultProxy.split("$");
    defaultLabel = E("defaultButton").label;
    E("defaultButton").label += proxies[0].split(";")[0];
    for(let i=0; i<proxies.length; i++) {
      var mitem = document.createElementNS(
        "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "menuitem");
      mitem.setAttribute("id", i);
      mitem.setAttribute("type", "radio");
      mitem.setAttribute("label", proxies[i].split(";")[0]);
      mitem.setAttribute("onclick", "changeDefaultLabel(this)");
      E("defaultButton").firstChild.appendChild(mitem);
    }
  }
}

function changeDefaultLabel(mitem)
{
  selectedId = parseInt(mitem.id);
  E("defaultButton").label = defaultLabel + mitem.label;
}

function subscribeAndSetDefault() {
  if (autoAdd) {
    var sP = proxies[selectedId];
    sP = sP.split(";");
    if (sP[1] == "") sP[1] = "127.0.0.1";
    if (sP[3] == "") sP[3] = "http";
    prefs.globalProxy = sP[0] + ";" + sP[1] + ";" + sP[2] + ";" + sP[3];
    prefs.save();
  }

  var group = E("subscriptions");
  var selected = group.selectedItem;
  if (!selected)
    return;

  result.url = selected.getAttribute("_url");
  result.title = selected.getAttribute("_title");
  result.autoDownload = true;
  result.disabled = false;

  if (autoAdd)
    aup.addSubscription(result.url, result.title, result.autoDownload, result.disabled);
}

function addOther() {
  openDialog("subscription.xul", "_blank", "chrome,centerscreen,modal", null, result);
  if ("url" in result)
  {
    if (autoAdd)
      aup.addSubscription(result.url, result.title, result.autoDownload, result.disabled);
    window.close();
  }
}

function handleKeyPress(e) {
  switch (e.keyCode) {
    case e.DOM_VK_PAGE_UP:
    case e.DOM_VK_PAGE_DOWN:
    case e.DOM_VK_END:
    case e.DOM_VK_HOME:
    case e.DOM_VK_LEFT:
    case e.DOM_VK_RIGHT:
    case e.DOM_VK_UP:
    case e.DOM_VK_DOWN:
      return false;
  }
  return true;
}

function handleCommand(event)
{
  let scrollBox = document.getElementById("subscriptionsScrollbox").boxObject
                     .QueryInterface(Components.interfaces.nsIScrollBoxObject);
  scrollBox.ensureElementIsVisible(event.target);
  scrollBox.ensureElementIsVisible(event.target.nextSibling);
}
