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

// may support multi-proxy later
var proxy = prefs.proxyServer.split("$")[0].split(";");
// default
var proxyName = proxy[0] || "default";
var proxyHost = proxy[1] || "127.0.0.1";
var proxyPort = proxy[2] || "8000";
var proxyType = proxy[3] || "http";

let E = function(a) { return document.getElementById(a); }

function init() {
  E("serverName").setAttribute("value", proxyName);
  E("serverHost").setAttribute("value", proxyHost);
  E("serverPort").setAttribute("value", proxyPort);
  // the first radio button is selected by default, may selecte 2 radios.
  E("http").setAttribute("selected", "false");
  E(proxyType).setAttribute("selected", "true");
}

function saveProxyServerSettings()
{
  proxyName = E("serverName").value;
  proxyHost = E("serverHost").value;
  proxyPort = E("serverPort").value;
  if ( E("http").selected ) proxyType = "http";
  else if ( E("socks4").selected ) proxyType = "socks4";
  else proxyType = "socks5";
  prefs.proxyServer =
          proxyName + ";" + proxyHost + ";" + proxyPort + ";" + proxyType + "$";
  prefs.save();
}

