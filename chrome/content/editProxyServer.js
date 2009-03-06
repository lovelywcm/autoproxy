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

let rows;
let gE = function(a) { return document.getElementById(a); };
let cE = function(b) { return document.createElementNS(
		 "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", b); };

function init()
{
  rows = document.getElementsByTagName("rows")[0];
  if (proxies == "") proxies = prefs.defaultProxy.split("$");

  for (var i=0; i<proxies.length; i++) {
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
  window.sizeToContent();
  window.centerWindowOnScreen();
}

function delSelectedRow()
{
  let row = rows.firstChild.nextSibling;
  while (row) {
    let temp = row;
    row = row.nextSibling;
    if (temp.lastChild.checked) {
      rows.removeChild(temp);
      window.sizeToContent();
    }
  }
  window.centerWindowOnScreen();
}

function reset2Default()
{
  let row = rows.firstChild.nextSibling;
  while (row) {
    let temp = row;
    row = row.nextSibling;
    rows.removeChild(temp);
    window.sizeToContent();
  }

  proxies = "";
  init();
  window.sizeToContent();
  window.centerWindowOnScreen();
}

function saveProxyServerSettings()
{
  var pconfig = "";
  for (let row=rows.firstChild.nextSibling; row; row=row.nextSibling) {
    var pDs = row.firstChild; // proxyDetails -> proxyName
    for (var i = 0; i <= 2; i++) { //name, host, port
      if (pDs.value == "127.0.0.1") pDs.value = ""; //127.0.0.1 is default
      pconfig += pDs.value;
      pconfig += ";"
      pDs = pDs.nextSibling
    }

    pDs = pDs.firstChild; // pDs -> 'http'
    if (pDs.selected) ; // http is default
    else if (pDs.nextSibling.selected) pconfig += "socks4";
      else pconfig += "socks"; // socks means socks5

    pconfig += "$";
  }

  if (pconfig)
    // remove the last "$" symbol
    pconfig = pconfig.replace(/\$$/, "");

  prefs.customProxy = pconfig;
  prefs.save();
}

