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
 * Portions created by the Initial Developer are Copyright (C) 2006-2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK ***** */

var aup = Components.classes["@mozilla.org/autoproxy;1"].createInstance().wrappedJSObject;
var prefs = aup.prefs;

var proxies = prefs.customProxy.split("$");
if (proxies == "") proxies = prefs.defaultProxy.split("$");

let gE = function(a) { return document.getElementById(a); }
let cE = function(b) { return document.createElementNS(
          "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", b) }

function init()
{
  var rows = document.getElementsByTagName("rows")[0];

  // one row per server
  for(var i=0; i<proxies.length; i++) {
    // proxy row and it's nodes
    var proxyRow  = cE("row");
    var proxyName = cE("textbox");
    var proxyHost = cE("textbox");
    var proxyPort = cE("textbox");
    var proxyType = cE("radiogroup");
    var proxyDele = cE("checkbox");
    proxyName.setAttribute("class", "proxyName");
    proxyHost.setAttribute("class", "proxyHost");
    proxyPort.setAttribute("class", "proxyPort");
    proxyDele.setAttribute("class", "deleBox");
    proxyName.setAttribute("id", "proxy" + i + "name");
    proxyHost.setAttribute("id", "proxy" + i + "host");
    proxyPort.setAttribute("id", "proxy" + i + "port");
    proxyDele.setAttribute("id", "proxy" + i + "dele");
    proxyType.setAttribute("orient", "horizontal");

    // proxy type nodes
    var http = cE("radio");
    var socks4 = cE("radio");
    var socks5 = cE("radio");
    http.setAttribute("class", "proxyHttp");
    socks4.setAttribute("class", "proxySocks4");
    socks5.setAttribute("class", "proxySocks5");
    http.setAttribute("id", "proxy" + i + "http");
    socks4.setAttribute("id", "proxy" + i + "socks4");
    socks5.setAttribute("id", "proxy" + i + "socks5");

    // proxy config
    var pconfig = proxies[i].split(";");
    proxyName.setAttribute("value", pconfig[0]);
    proxyHost.setAttribute("value", pconfig[1] || "127.0.0.1");
    proxyPort.setAttribute("value", pconfig[2]);
    switch (pconfig[3]) {
      case "socks4": { socks4.setAttribute("selected", "true"); break; }
      case "socks5": { socks5.setAttribute("selected", "true"); break; }
      default: http.setAttribute("selected", "true");
    }

    // insert type nodes to type
    proxyType.appendChild(http);
    proxyType.appendChild(socks4);
    proxyType.appendChild(socks5);

    // insert proxy nodes to proxy row
    proxyRow.appendChild(proxyName);
    proxyRow.appendChild(proxyHost);
    proxyRow.appendChild(proxyPort);
    proxyRow.appendChild(proxyType);
    proxyRow.appendChild(proxyDele);

    // insert proxy row to rows
    rows.appendChild(proxyRow);
  }
}

function saveProxyServerSettings()
{
//  proxyName = E("proxyName").value;
//  proxyHost = E("proxyHost").value;
//  proxyPort = E("proxyPort").value;
//  if ( E("http").selected ) proxyType = "http";
//  else if ( E("socks4").selected ) proxyType = "socks4";
//  else proxyType = "socks5";
//  prefs.proxyServer =
//          proxyName + ";" + proxyHost + ";" + proxyPort + ";" + proxyType + "$";
//  prefs.setAttributeve();
}

