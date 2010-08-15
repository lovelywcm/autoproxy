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

var proxies = proxy.validConfigs;
var defaultProxy = prefs.defaultProxy;

let rows;

function init()
{
  rows = document.getElementsByTagName("rows")[0];
  for (var i=0; i<proxies.length; i++) createBlankRow(proxies[i]);
}

function createBlankRow(proxy)
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
  var socks = cE("radio");
  http.setAttribute("class", "proxyHttp");
  socks4.setAttribute("class", "proxySocks4");
  socks.setAttribute("class", "proxySocks5");

  if (proxy) {
    proxyName.setAttribute("value", proxy.name);
    proxyHost.setAttribute("value", proxy.host);
    proxyPort.setAttribute("value", proxy.port);
    eval( proxy.type + ".setAttribute('selected', true)" );
  }

  // insert type nodes to type
  proxyType.appendChild(http);
  proxyType.appendChild(socks4);
  proxyType.appendChild(socks);

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
  E("warning").hidden = E("note").hidden = E("tip").hidden = true;
  window.sizeToContent();
}

/**
 * sizeToContent():
 * need to call it every time size changed.
 * should not call it any time size not changed.
 */
function show(id)
{
  if ( E(id).hidden ) {
    E(id).hidden = false;
    window.sizeToContent();
  }
}

function hide(id)
{
  if ( !E(id).hidden ) {
    E(id).hidden = true;
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

  // check whether default proxy has been removed.
  // it may be modified before delete, so do a new loop.
  if (defaultProxy != 0 ) {
    show("note");
    for (row=rows.firstChild.nextSibling; row; row=row.nextSibling) {
      if (row.firstChild.value == aup.proxy.nameOfDefaultProxy) {
        hide("note"); break;
      }
    }
  }

  if ( !E("warning").hidden ) hide("note");
  if ( E("warning").hidden && E("note").hidden ) hide("tip");
  else show("tip");
}

function reset2Default()
{
  E("warning").hidden = E("note").hidden = E("tip").hidden = true;

  let row = rows.firstChild.nextSibling;
  while (row) {
    let temp = row;
    row = row.nextSibling;
    rows.removeChild(temp);
    window.sizeToContent();
  }

  proxies = proxy.configToObj(prefs.knownProxy);
  init();
  window.sizeToContent();

  defaultProxy = 10;
}

function saveProxyServerSettings()
{
  var pConfig = "";
  var matchedDefaultProxy = "";
  // reset2Default()
  prefs.defaultProxy = defaultProxy;

  for (let row=rows.firstChild.nextSibling; row; row=row.nextSibling) {
    var temp = "";
    var pDs = row.firstChild; // proxyDetails -> proxyName
    for (var i = 0; i <= 2; i++) { //name, host, port
      // duplicate proxy name or unnamed, rename it.
      if (i==0) {
        if ( pDs.value == "" ) pDs.value = "Unnamed";
        if ( pConfig.indexOf(pDs.value) != -1 ) {
          var j=2;
          while ( pConfig.indexOf(pDs.value + j.toString()) != -1 ) j++;
          pDs.value += j.toString();
        }
      }
      if(i==1 && pDs.value=="") pDs.value = "127.0.0.1";

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

    pConfig += temp;
    pConfig += "$";
  }

  if (pConfig) {
    // remove the last "$" symbol
    pConfig = pConfig.replace(/\$$/, "");
      if (defaultProxy > 0) {
          let newProxies = aup.proxy.configToObj(pConfig);
          let hasDefaultProxy = newProxies.some(function(proxy, index) {
              if (proxy.name == aup.proxy.nameOfDefaultProxy) {
                  prefs.defaultProxy = index + 1;
                  return true;
              }
          });
          if (!hasDefaultProxy) prefs.defaultProxy = 1;
      }
  }
  else {
    // all proxies removed, restore to default.
    prefs.defaultProxy = 10;
  }

  prefs.customProxy = (pConfig == prefs.knownProxy ? '' : pConfig);
  prefs.save();
}
