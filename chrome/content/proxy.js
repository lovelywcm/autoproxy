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
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * 2010: slimx <slimxfir@gmail.com>.
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * Core implementation of proxy mechanism
 * This file is included from AutoProxy.js.
 */

const pS = Cc["@mozilla.org/network/protocol-proxy-service;1"].getService(Ci.nsIProtocolProxyService);

var proxy =
{
  server: null,
  defaultProxy: null,
  fallbackProxy: null,

  validConfigs: null,
  getName: null,
  mode: ['auto', 'global', 'disabled'],

  init: function()
  {
    // TODO
  },

  reloadPrefs: function()
  {
    // Refresh validConfigs - array of objects
    this.validConfigs = this.configToObj(prefs.customProxy) ||
                            this.configToObj(prefs.knownProxy);

    /**
     * Refresh proxy name string array (getName) & available proxy servers
     *
     * server (array of nsIProxyInfo):
     *   server[0]: direct
     *   server[1-]: corresponding proxy in custom/known proxy list
     *
     * newProxyInfo(type, host, port, socks_remote_dns, failoverTimeout, failoverProxy)
     */
    this.getName = [ '直接连接' ];
    this.server = [ pS.newProxyInfo('direct', '', -1, 0, 0, null) ];
    for each ( var conf in this.validConfigs) {
      this.getName.push( conf.name );
      this.server.push(pS.newProxyInfo(conf.type, conf.host, conf.port, 1, 0, null));
    }

    this.nameOfDefaultProxy = this.getName[ prefs.defaultProxy ];

    /**
     * Refresh defaultProxy (nsIProxyInfo)
     *
     * prefs.defaultProxy:
     *   0: direct
     *   1 - customProxy/knownProxy.length: corresponding proxy
     *   other: invalid, take 1 as it's value(use the first proxy)
     */
    this.defaultProxy = this.server[ prefs.defaultProxy ] || this.server[1];

    /**
     * Refresh fallbackProxy (nsIProxyInfo)
     *
     * prefs.fallbackProxy:
     *   -1: same as default proxy
     *    0: direct
     *   1 - customProxy/knownProxy.length: corresponding proxy
     *   other: invalid, take 0 as it's value(direct connect)
     */
    if ( prefs.fallbackProxy == -1 ) this.fallbackProxy = this.defaultProxy;
    else this.fallbackProxy = this.server[ prefs.fallbackProxy ] || this.server[0];

    // Register/Unregister proxy filter & refresh shouldProxy() for specified mode
    if ( prefs.proxyMode == "disabled" ) pS.unregisterFilter(this);
    else {
      if ( prefs.proxyMode == "global" ) policy.shouldProxy = function() { return true; };
      else policy.shouldProxy = policy.autoMatching;

      pS.unregisterFilter(this);
      pS.registerFilter(this, 0);
    }
  },

  configToObj: function(config)
  {
      if(config=="")return false;
      var array = [];
      var proxyAttrArray = config.split("$");
      for each(var i in proxyAttrArray)
      {
          var proxyAttr = i.split(";");
          var proxy={};
          proxy.name = proxyAttr[0];
          proxy.host = proxyAttr[1]==""?"127.0.0.1":proxyAttr[1];
          proxy.port = proxyAttr[2];
          proxy.type = proxyAttr[3]==""?"http":proxyAttr[3];
          array.push(proxy);
      }
      return array.length==0?false:array;
  },

  /**
   * Checks whether the location's scheme is proxyable
   * @param location  {nsIURI}
   * @return {Boolean}
   */
  isProxyableScheme: function(location)
  {
    return ["http", "https", "ftp", "gopher"].some(
      function(scheme){return location.scheme==scheme} );
  },

  //
  // nsIProtocolProxyFilter implementation
  //
  applyFilter: function(pS, uri, aProxy)
  {
    if ( uri.schemeIs("feed") ) return this.server[0];
    if ( policy.shouldProxy(uri) ) return this.defaultProxy;
    return this.fallbackProxy;
  }
};

aup.proxy = proxy;

// TODO: i18n
// TODO: if ( customProxy == knownProxy ) customProxy = "";
// TODO: ";" & "$" is not allowed in proxy name
// TODO: editProxyServer.js
// TODO: call this.reloadPrefs only when necessary?
