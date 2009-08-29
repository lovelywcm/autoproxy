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
 * Portions created by the Initial Developer are Copyright (C) 2006-2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * Wang Congming <lovelywcm@gmail.com> Modified for AutoProxy.
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * Content policy implementation, responsible for proxying things.
 * This file is included from AutoProxy.js.
 */

var effectiveTLD = Cc["@mozilla.org/network/effective-tld-service;1"].getService(Ci.nsIEffectiveTLDService);
var proxyService = Cc["@mozilla.org/network/protocol-proxy-service;1"].getService(Ci.nsIProtocolProxyService);

const ok = Ci.nsIContentPolicy.ACCEPT;

var policy =
{
  /**
   * Map of content type identifiers by their name.
   * @type Object
   */
  type: null,

  /**
   * Map of content type names by their identifiers (reverse of type map).
   * @type Object
   */
  typeDescr: null,

  /**
   * Map of localized content type names by their identifiers.
   * @type Object
   */
  localizedDescr: null,

  /**
   * Map containing all schemes that should be ignored by content policy.
   * @type Object
   */
  whitelistSchemes: null,

  /**
   * Indicate whether the proxy is enabled or not.
   */
  proxyEnabled: false,

  /**
   * Array of Proxy Details, used by newProxyInfo() of applyFilter().
   * example: ['Tor', '127.0.0.1', '9050', 'socks']. socks meanings socks5.
   * Every time proxy changed, this array will be refreshed.
   */
  aupPDs: [],

  /**
   * Read global proxy from prefs. This function will be called at startup
   * or every time user specified a different global proxy.
   */
  readDefaultProxy: function()
  {
    this.proxyEnabled = false;
    proxyService.unregisterFilter(this);
    this.aupPDs = prefs.defaultProxy.split(";");
    if (this.aupPDs[3] != "direct") {
      if (this.aupPDs[1] == "") this.aupPDs[1] = "127.0.0.1";
      if (this.aupPDs[3] == "") this.aupPDs[3] = "http";
    }
  },

  //
  // nsIProtocolProxyFilter implementation
  //
  applyFilter: function(pS, uri, proxy)
  {
    // type, host, port, network.proxy.socks_remote_dns=true,
    // failoverTimeout=0, failoverProxy=null
    return pS.newProxyInfo(this.aupPDs[3], this.aupPDs[1], this.aupPDs[2], 1, 0, null);
  },

  goProxy: function()
  {
    // nsIProtocolProxyFilter, position(this proxy in proxy list)=0
    proxyService.registerFilter(this, 0);
    this.proxyEnabled = true;
  },

  noProxy: function()
  {
    proxyService.unregisterFilter(this);
    this.proxyEnabled = false;
  },

  init: function()
  {
    this.readDefaultProxy();

    var types = ["OTHER", "SCRIPT", "IMAGE", "STYLESHEET", "OBJECT", "SUBDOCUMENT",
      "DOCUMENT", "XBL", "PING", "XMLHTTPREQUEST", "OBJECT_SUBREQUEST", "DTD", "FONT", "MEDIA"];

    // type constant by type description and type description by type constant
    this.type = {};
    this.typeDescr = {};
    this.localizedDescr = {};
    var iface = Ci.nsIContentPolicy;
    for each (let typeName in types)
    {
      if ("TYPE_" + typeName in iface)
      {
        this.type[typeName] = iface["TYPE_" + typeName];
        this.typeDescr[this.type[typeName]] = typeName;
        this.localizedDescr[this.type[typeName]] = aup.getString("type_label_" + typeName.toLowerCase());
      }
    }

    this.type.BACKGROUND = 0xFFFE;
    this.typeDescr[0xFFFE] = "BACKGROUND";
    this.localizedDescr[0xFFFE] = aup.getString("type_label_background");

    // whitelisted URL schemes
    this.whitelistSchemes = {};
    for each (var scheme in prefs.whitelistschemes.toLowerCase().split(" "))
      this.whitelistSchemes[scheme] = true;
  },

  /**
   * Checks whether a node should be proxyed
   * @param wnd {nsIDOMWindow}
   * @param node {nsIDOMElement}
   * @param contentType {String}
   * @param location {nsIURI}
   * @return {Boolean} true if the node should be proxyed
   */
  shouldProxy: function(wnd, node, contentType, location) {
    var topWnd = wnd.top;
    if (!topWnd || !topWnd.location || !topWnd.location.href)
      return false;

    var match = null;
    var locationText = location.spec;
    if (!match && prefs.enabled)
    {
      match = this.isWindowWhitelisted(topWnd);
      if (match)
      {
        filterStorage.increaseHitCount(match);
        return false;
      }
    }

    // Data loaded by plugins should be attached to the document
    if ((contentType == this.type.OTHER || contentType == this.type.OBJECT_SUBREQUEST) && node instanceof Element)
      node = node.ownerDocument;

    // Fix type for background images
    if (contentType == this.type.IMAGE && node.nodeType == Node.DOCUMENT_NODE)
      contentType = this.type.BACKGROUND;

    // Fix type for objects misrepresented as frames or images
    if (contentType != this.type.OBJECT && (node instanceof Ci.nsIDOMHTMLObjectElement || 
                                            node instanceof Ci.nsIDOMHTMLEmbedElement ))
      contentType = this.type.OBJECT;

    var data = DataContainer.getDataForWindow(wnd);

    let docDomain = this.getHostname(wnd.location.href);
    let thirdParty = this.isThirdParty(location, docDomain);

    if (!match && prefs.enabled) {
      match = whitelistMatcher.matchesAny(locationText, this.typeDescr[contentType] || "", docDomain, thirdParty);
      if (match == null)
        match = blacklistMatcher.matchesAny(locationText, this.typeDescr[contentType] || "", docDomain, thirdParty);
    }

    // Store node data
    var nodeData = data.addNode(topWnd, node, contentType, docDomain, thirdParty, locationText, match);
    if (match)
      filterStorage.increaseHitCount(match);

    return match && !(match instanceof WhitelistFilter);
  },

  /**
   * Checks whether the location's scheme is blockable.
   * @param location  {nsIURI}
   * @return {Boolean}
   */
  isBlockableScheme: function(location) {
    return !(location.scheme in this.whitelistSchemes);
  },

  /**
   * Extracts the hostname from a URL (might return null).
   */
  getHostname: function(/**String*/ url) /**String*/
  {
    try
    {
      return unwrapURL(url).host;
    }
    catch(e)
    {
      return null;
    }
  },

  /**
   * Checks whether a page is whitelisted.
   * @param url {String}
   * @return {Boolean}
   */
  isWhitelisted: function(url) {
    return whitelistMatcher.matchesAny(url, "DOCUMENT", this.getHostname(url), false);
  },

  /**
   * Checks whether the page loaded in a window is whitelisted.
   * @param wnd {nsIDOMWindow}
   * @return {Boolean}
   */
  isWindowWhitelisted: function(wnd)
  {
    if ("name" in wnd && wnd.name == "messagepane")
    {
      // Thunderbird branch
      try
      {
        let mailWnd = wnd.QueryInterface(Ci.nsIInterfaceRequestor)
                         .getInterface(Ci.nsIWebNavigation)
                         .QueryInterface(Ci.nsIDocShellTreeItem)
                         .rootTreeItem
                         .QueryInterface(Ci.nsIInterfaceRequestor)
                         .getInterface(Ci.nsIDOMWindow);

        // Typically we get a wrapped mail window here, need to unwrap
        try
        {
          mailWnd = mailWnd.wrappedJSObject;
        } catch(e) {}

        if ("currentHeaderData" in mailWnd && "content-base" in mailWnd.currentHeaderData)
        {
          return this.isWhitelisted(mailWnd.currentHeaderData["content-base"].headerValue);
        }
        else if ("gDBView" in mailWnd)
        {
          let msgHdr = mailWnd.gDBView.hdrForFirstSelectedMessage;
          let emailAddress = headerParser.extractHeaderAddressMailboxes(null, msgHdr.author);
          if (emailAddress)
          {
            emailAddress = 'mailto:' + emailAddress.replace(/^[\s"]+/, "").replace(/[\s"]+$/, "").replace(/\s/g, '%20');
            return this.isWhitelisted(emailAddress);
          }
        }
      } catch(e) {}
    }
    else
    {
      // Firefox branch
      return this.isWhitelisted(wnd.location.href);
    }
    return null;
  },

  /**
   * Checks whether the location's origin is different from document's origin.
   */
  isThirdParty: function(/**nsIURI*/location, /**String*/ docDomain) /**Boolean*/
  {
    if (!location || !docDomain)
      return true;
    try
    {
      return effectiveTLD.getBaseDomain(location) != effectiveTLD.getBaseDomainFromHost(docDomain);
    }
    catch (e)
    {
      // EffectiveTLDService throws on IP addresses
      return location.host != docDomain;
    }
  },

  //
  // nsISupports interface implementation
  //

  QueryInterface: aup.QueryInterface,

  //
  // nsIContentPolicy interface implementation
  //

  shouldLoad: function(contentType, contentLocation, requestOrigin, node, mimeTypeGuess, extra) {
    // return unless we are initialized
    if (!this.whitelistSchemes)
      return ok;

    if (!node)
      return ok;

    var wnd = getWindow(node);
    if (!wnd)
      return ok;

    var location = unwrapURL(contentLocation);

    // Interpret unknown types as "other"
    if (!(contentType in this.typeDescr))
      contentType = this.type.OTHER;

    // if it's not a blockable type or a whitelisted scheme, use the usual policy
    if ( !this.isBlockableScheme(location) )
      return ok;

    this.shouldProxy(wnd, node, contentType, location) ?
      this.proxyEnabled || this.goProxy() : this.proxyEnabled && this.noProxy();

    return ok;
  },

  shouldProcess: function(contentType, contentLocation, requestOrigin, insecNode, mimeType, extra) {
    return ok;
  },

  //
  // nsIChannelEventSink interface implementation
  //

  onChannelRedirect: function(oldChannel, newChannel, flags)
  {
    try {
      let oldLocation = null;
      let newLocation = null;
      try {
        oldLocation = oldChannel.originalURI.spec;
        newLocation = newChannel.URI.spec;
      }
      catch(e2) {}

      if (!oldLocation || !newLocation || oldLocation == newLocation)
        return;

      // Look for the request both in the origin window and in its parent (for frames)
      let contexts = [getRequestWindow(newChannel)];
      if (!contexts[0])
        contexts.pop();
      else if (contexts[0] && contexts[0].parent != contexts[0])
        contexts.push(contexts[0].parent);

      let info = null;
      for each (let context in contexts)
      {
        // Did we record the original request in its own window?
        let data = DataContainer.getDataForWindow(context, true);
        if (data)
          info = data.getURLInfo(oldLocation);

        if (info)
        {
          let node = (info.nodes.length ? info.nodes[info.nodes.length - 1] : context.document);
          // HACK: NS_BINDING_ABORTED would be proper error code to throw but this will show up in error console (bug 287107)
          if (!this.processNode(context, node, info.type, newChannel.URI))
            throw Cr.NS_BASE_STREAM_WOULD_BLOCK;
          else
            return;
        }
      }
    }
    catch (e if (e != Cr.NS_BASE_STREAM_WOULD_BLOCK))
    {
      // We shouldn't throw exceptions here - this will prevent the redirect.
      dump("AutoProxy: Unexpected error in policy.onChannelRedirect: " + e + "\n");
    }
  },

  // Reapplies filters to all nodes of the window
  refilterWindowInternal: function(wnd, start) {
    if (wnd.closed)
      return;

    var wndData = aup.getDataForWindow(wnd);
    var data = wndData.getAllLocations();
    for (var i = start; i < data.length; i++) {
      if (i - start >= 20) {
        // Allow events to process
        createTimer(function() {policy.refilterWindowInternal(wnd, i);}, 0);
        return;
      }

      if (!data[i].filter || data[i].filter instanceof WhitelistFilter) {
        var nodes = data[i].nodes;
        data[i].nodes = [];
        for (var j = 0; j < nodes.length; j++) {
          //this.shouldProxy(wnd, nodes[j], data[i].type, makeURL(data[i].location));
        }
      }
    }

    aup.DataContainer.notifyListeners(wnd, "invalidate", data);
  },

  // Calls refilterWindowInternal delayed to allow events to process
  refilterWindow: function(wnd) {
    createTimer(function() {policy.refilterWindowInternal(wnd, 0);}, 0);
  }
};

aup.policy = policy;
