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

const pS = Cc['@mozilla.org/network/protocol-proxy-service;1'].getService(Ci.nsIProtocolProxyService);

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
    this.reloadPrefs();
    prefs.addListener(this.reloadPrefs);
  },

  reloadPrefs: function()
  {
    // Refresh validConfigs - array of objects
    proxy.validConfigs = proxy.configToObj(prefs.customProxy) ||
                            proxy.configToObj(prefs.knownProxy);

    /**
     * Refresh proxy name string array (getName) & available proxy servers
     *
     * server (array of nsIProxyInfo):
     *   server[0]: direct
     *   server[1-]: corresponding proxy in custom/known proxy list
     *
     * newProxyInfo(type, host, port, socks_remote_dns, failoverTimeout, failoverProxy)
     */
    proxy.getName = [ aup.getString('directConnect') ];
    proxy.server = [ pS.newProxyInfo('direct', '', -1, 0, 0, null) ];
    for each ( var conf in proxy.validConfigs) {
      proxy.getName.push(conf.name);
      proxy.server.push(pS.newProxyInfo(conf.type, conf.host, conf.port, 1, 0, null));
    }

    proxy.nameOfDefaultProxy = proxy.getName[prefs.defaultProxy];

    /**
     * Refresh defaultProxy (nsIProxyInfo)
     *
     * prefs.defaultProxy:
     *   0: direct
     *   1 - customProxy/knownProxy.length: corresponding proxy
     *   other: invalid, take 1 as it's value(use the first proxy)
     */
    proxy.defaultProxy = proxy.server[prefs.defaultProxy] || proxy.server[1];

    /**
     * Refresh fallbackProxy (nsIProxyInfo)
     *
     * prefs.fallbackProxy:
     *   -1: same as default proxy
     *    0: direct
     *   1 - customProxy/knownProxy.length: corresponding proxy
     *   other: invalid, take 0 as it's value(direct connect)
     */
    if ( prefs.fallbackProxy == -1 ) proxy.fallbackProxy = proxy.defaultProxy;
    else proxy.fallbackProxy = proxy.server[prefs.fallbackProxy] || proxy.server[0];

    pS.unregisterFilter(proxy);
    pS.registerFilter(proxy, 0);
  },

  /**
   * Convert proxy config(e.g.: prefs.knownProxy) to objects for convenient usage later
   *
   * @param config {String}
   * @return {Array} of objects
   */
  configToObj: function(config)
  {
    var proxyObjArray = [];

    for each (var proxyAttr in config.split('$')) {
      proxyAttr = proxyAttr.split(';');
      if (proxyAttr.length != 4 || proxyAttr[0] == '' || isNaN(proxyAttr[2]))
        continue;

      var proxyObj = {};
      proxyObj.name = proxyAttr[0];
      proxyObj.host = proxyAttr[1] == '' ? '127.0.0.1' : proxyAttr[1];
      proxyObj.port = proxyAttr[2];
      proxyObj.type = /^socks4?$/i.test(proxyAttr[3]) ? proxyAttr[3] : 'http';
      proxyObjArray.push(proxyObj);
    }

    return proxyObjArray.length == 0 ? false : proxyObjArray;
  },

  /**
   * Checks whether the location's scheme is proxyable
   *
   * @param location {nsIURI}
   * @return {Boolean}
   */
  isProxyableScheme: function(location)
  {
    return ['http', 'https', 'ftp', 'gopher'].some(
      function(scheme){return location.scheme==scheme} );
  },

  /**
   * Switch to specified proxy mode
   * @param mode {String} see this.mode
   */
  switchToMode: function(mode)
  {
    prefs.proxyMode = mode;
    prefs.save();
  },

  //
  // nsIProtocolProxyFilter implementation
  //
  applyFilter: function(pS, uri, aProxy)
  {
    if (prefs.proxyMode == 'disabled' || uri.schemeIs('feed')) return this.server[0];
    if (prefs.proxyMode == 'global') return this.defaultProxy;

    var match = policy.autoMatching(uri);
    if (!match || match instanceof WhitelistFilter) return this.fallbackProxy;

    for each (var s in match.subscriptions)
      if (!s.disabled) return this.server[s.proxy] || this.defaultProxy;
  }
};

aup.proxy = proxy;

// TODO: i18n
// TODO: ";" & "$" is not allowed in proxy name
// TODO: editProxyServer.js
