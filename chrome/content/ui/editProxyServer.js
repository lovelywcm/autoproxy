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
var proxies = prefs.customProxy.split("$");
if (proxies == "") proxies = prefs.defaultProxy.split("$");
var globalProxy = prefs.globalProxy;

let rows;
let gE = function(a) { return document.getElementById(a); };
let cE = function(b) { return document.createElementNS(
		 "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", b); };

function init()
{
  rows = document.getElementsByTagName("rows")[0];
  for (var i=0; i<proxies.length; i++) {
    if (proxies[i] == "") continue;
    createBlankRow();

    var pconfig = proxies[i].split(";");
    pconfig[1] = pconfig[1] || "127.0.0.1";
    var pDs = rows.lastChild.firstChild; // proxyDetails -> proxyName

    for (var j = 0; j <= 2; j++, pDs = pDs.nextSibling)
                  pDs.setAttribute( "value", pconfig[j] ); //name, host, port

    pDs = pDs.firstChild; // pDs -> http
    switch (pconfig[3]) {
      case "socks4": { pDs = pDs.nextSibling; break; }
      case "socks": { pDs = pDs.nextSibling.nextSibling; break; }
    }
    pDs.parentNode.selectedItem = pDs;
  }
}

function createBlankRow()
{
  // a new row
  var proxyRow  = cE("row");

  // nodes of the new row
  var proxyName = cE("textbox");
  var proxyHost = cE("textbox");
  var proxyPort = cE("textbox");
  var proxyType = cE("radiogroup");
  var proxyDele = cE("checkbox");
  proxyName.setAttribute("class", "proxyName");
  proxyHost.setAttribute("class", "proxyHost");
  proxyPort.setAttribute("class", "proxyPort");
  proxyDele.setAttribute("class", "deleBox");
  proxyType.setAttribute("orient", "horizontal");

  // proxy type nodes
  var http = cE("radio");
  var socks4 = cE("radio");
  var socks5 = cE("radio");
  http.setAttribute("class", "proxyHttp");
  socks4.setAttribute("class", "proxySocks4");
  socks5.setAttribute("class", "proxySocks5");

  // insert type nodes to type
  proxyType.appendChild(http);
  proxyType.appendChild(socks4);
  proxyType.appendChild(socks5);

  // insert row nodes to the new proxy row
  proxyRow.appendChild(proxyName);
  proxyRow.appendChild(proxyHost);
  proxyRow.appendChild(proxyPort);
  proxyRow.appendChild(proxyType);
  proxyRow.appendChild(proxyDele);

  // insert proxy row to rows
  rows.appendChild(proxyRow);
}

function addNewRow()
{
  createBlankRow();
  gE("warning").hidden = gE("note").hidden = gE("tip").hidden = true;
  window.sizeToContent();
  window.centerWindowOnScreen();
}

/**
 * sizeToContent():
 * need to call it every time size changed.
 * should not call it any time size not changed.
 */
function show(id)
{
  if ( gE(id).hidden ) {
    gE(id).hidden = false;
    window.sizeToContent();
  }
}

function hide(id)
{
  if ( !gE(id).hidden ) {
    gE(id).hidden = true;
    window.sizeToContent();
  }
}

function delSelectedRow()
{
  show("warning");
  let row = rows.firstChild.nextSibling;
  while (row) {
    var temp = row;
    row = row.nextSibling;
    if (temp.lastChild.checked) {
      rows.removeChild(temp);
      window.sizeToContent();
    }
    else hide("warning");
  }

  // check whether global proxy has been removed.
  // it may be modified before delete, so do a new loop.
  show("note");
  for (row=rows.firstChild.nextSibling; row; row=row.nextSibling) {
    let pDs = "";
    temp = row.firstChild;
    for (var i=0; i<=2; i++) {
      pDs += temp.value;
      pDs += ";";
      temp = temp.nextSibling;
    }
    temp = temp.firstChild.nextSibling;
    if (temp.selected) pDs += "socks4";
    else if (temp.nextSibling.selected) pDs += "socks";

    if ( pDs.replace(/127\.0\.0\.1/,"") == globalProxy ) {
      hide("note"); break;
    }
  }

  if ( !gE("warning").hidden ) hide("note");
  if ( gE("warning").hidden && gE("note").hidden ) hide("tip");
  else show("tip");

  window.centerWindowOnScreen();
}

function reset2Default()
{
  gE("warning").hidden = gE("note").hidden = gE("tip").hidden = true;

  let row = rows.firstChild.nextSibling;
  while (row) {
    let temp = row;
    row = row.nextSibling;
    rows.removeChild(temp);
    window.sizeToContent();
  }

  proxies = prefs.defaultProxy.split("$");
  init();
  window.sizeToContent();
  window.centerWindowOnScreen();

  globalProxy = prefs.defaultProxy.split("$")[0];
}

function saveProxyServerSettings()
{
  var pconfig = "";
  var matchedGlobalProxy = "";
  // reset2Default()
  prefs.globalProxy = globalProxy;

  for (let row=rows.firstChild.nextSibling; row; row=row.nextSibling) {
    var temp = "";
    var pDs = row.firstChild; // proxyDetails -> proxyName
    for (var i = 0; i <= 2; i++) { //name, host, port
      // duplicate proxy name or unnamed, rename it.
      if (i==0) {
        if ( pDs.value == "" ) pDs.value = "Unnamed";
        if ( pconfig.indexOf(pDs.value) != -1 ) {
          var j=2;
          while ( pconfig.indexOf(pDs.value + j.toString()) != -1 ) j++;
          pDs.value += j.toString();
        }
      }

      temp += pDs.value;
      temp += ";";
      pDs = pDs.nextSibling;
    }

    // 'host' or 'port' not filled, ignore this row.
    if ( /;;/.test(temp) ) continue;

    pDs = pDs.firstChild; // pDs -> 'http'
    if (pDs.selected) ; // http is default
    else if (pDs.nextSibling.selected) temp += "socks4";
      else temp += "socks"; // socks means socks5

    // 127.0.0.1 is default
    temp = temp.replace(/127\.0\.0\.1/, "");

    // original global proxy may be modified or deleted.
    // if a proxy has the same name or configuration as it, copy the proxy.
    if ( multiIndex(globalProxy, matchedGlobalProxy) <= 0 )
      if ( multiIndex(globalProxy, temp) >= 0 ) matchedGlobalProxy = temp;

    pconfig += temp;
    pconfig += "$";
  }

  if (pconfig) {
    // remove the last "$" symbol
    pconfig = pconfig.replace(/\$$/, "");

    switch (multiIndex(globalProxy, matchedGlobalProxy)) {
      // not modified, pass.
      case 2: break;

      // original global proxy is null or has been removed,
      // choose the first proxy in proxy list as new global proxy.
      case -1: matchedGlobalProxy = pconfig.split("$")[0];

      // else: modified, but some infomation kept.
      default: prefs.globalProxy = matchedGlobalProxy;
    }
    // we had proxy now, go to work.
    if (prefs.customProxy == "") prefs.enabled = true;
  }
  else {
    // all proxies removed, stop working.
    prefs.enabled = false;
    prefs.globalProxy = "noProxy;;;direct";
  }

  prefs.customProxy = pconfig;
  prefs.save();
  aup.policy.readGlobalProxy();
}

/**
 * multiIndex(stringA, stringB)
 * return 2: stringB equal to stringA;
 * return 1: proxy name of stringB found in stringA;
 * return 0: proxy config(host, port, type) of string B found in stringA
 * return -1: else, not found or stringB is null.
 */
function multiIndex(sA, sB)
{
  if(sB == "") return -1;
  if (sA == sB) return 2;
  let proxyName = sB.split(";")[0];
  if ( sA.indexOf(proxyName) != -1 ) return 1;
  if ( sA.indexOf(sB.replace(proxyName,"")) != -1 ) return 0;
  return -1;
}
