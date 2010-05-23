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
 * 2009-2010: Wang Congming <lovelywcm@gmail.com> modified for AutoProxy.
 *
 * ***** END LICENSE BLOCK ***** */

var aupHideImageManager;

/**
 * List of event handers to be registered. For each event handler the element ID,
 * event and the actual event handler are listed.
 * @type Array
 */
let eventHandlers = [
  ["aup-tooltip", "popupshowing", aupFillTooltip],
  ["aup-status-popup", "popupshowing", aupFillPopup],
  ["aup-toolbar-popup", "popupshowing", aupFillPopup],
  ["aup-command-settings", "command", function() { aup.openSettingsDialog(); }],
  ["aup-command-sidebar", "command", aupToggleSidebar],
  ["aup-command-togglesitewhitelist", "command", function() { toggleFilter(siteWhitelist); }],
  ["aup-command-toggleshowintoolbar", "command", function() { aupTogglePref("showintoolbar"); }],
  ["aup-command-toggleshowinstatusbar", "command", function() { aupTogglePref("showinstatusbar"); }],
  ["aup-command-modeauto", "command", function() { switchToMode('auto'); }],
  ["aup-command-modeglobal", "command", function() { switchToMode('global'); }],
  ["aup-command-modedisabled", "command", function() { switchToMode('disabled'); }],
  ["aup-status", "click", aupClickHandler],
  ["aup-toolbarbutton", "click", function(event) { if (event.button==1) aupClickHandler(event) }],
  ["aup-toolbarbutton", "command", function(event) { if (event.eventPhase == event.AT_TARGET) aupCommandHandler(event); }]
];

/**
 * Stores the current value of showintoolbar preference (to detect changes).
 */
let currentlyShowingInToolbar = prefs.showintoolbar;

/**
 * Filter corresponding with "disable on site" menu item (set in aupFillPopup()).
 * @type Filter
 */
let siteWhitelist = null;

/**
 * Progress listener detecting location changes and triggering status updates.
 * @type nsIWebProgress
 */
let progressListener = null;

aupInit();

function aupInit() {
  // Process preferences
  window.aupDetachedSidebar = null;
  aupReloadPrefs();

  // Register event listeners
  window.addEventListener("unload", aupUnload, false);
  for each (let [id, event, handler] in eventHandlers)
  {
    let element = E(id);
    if (element)
      element.addEventListener(event, handler, false);
  }

  prefs.addListener(aupReloadPrefs);
  filterStorage.addFilterObserver(aupReloadPrefs);
  filterStorage.addSubscriptionObserver(aupReloadPrefs);

  let browser = aup.getBrowserInWindow(window);
  browser.addEventListener("click", handleLinkClick, true);

  let dummy = function() {};
  let progressListener = {
    onLocationChange: aupReloadPrefs,
    onProgressChange: dummy,
    onSecurityChange: dummy,
    onStateChange: dummy,
    onStatusChange: dummy
  };
  browser.addProgressListener(progressListener);

  // Make sure we always configure keys but don't let them break anything
  try {
    // Configure keys
    for (var key in prefs)
      if (key.match(/(.*)_key$/))
        aupConfigureKey(RegExp.$1, prefs[key]);
  } catch(e) {}

  // First run actions
  if (!("doneFirstRunActions" in prefs) && aup.versionComparator.compare(prefs.lastVersion, "0.0") <= 0)
  {
    // Don't repeat first run actions if new window is opened
    prefs.doneFirstRunActions = true;

    // Add aup icon to toolbar if necessary
    aup.createTimer(aupInstallInToolbar, 0);

    // Show subscriptions dialog if the user doesn't have any subscriptions yet
    aup.createTimer(aupShowSubscriptions, 0);
  }

  // Move toolbar button to a correct location in Mozilla/SeaMonkey
  var button = E("aup-toolbarbutton");
  if (button && button.parentNode.id == "nav-bar-buttons") {
    var ptf = E("bookmarks-ptf");
    ptf.parentNode.insertBefore(button, ptf);
  }

  // Copy the menu from status bar icon to the toolbar
  var fixId = function(node) {
    if (node.nodeType != node.ELEMENT_NODE)
      return node;

    if ("id" in node && node.id)
      node.id = node.id.replace(/aup-status/, "aup-toolbar");

    for (var child = node.firstChild; child; child = child.nextSibling)
      fixId(child);

    return node;
  };
  var copyMenu = function(to) {
    if (!to || !to.firstChild)
      return;

    to = to.firstChild;
    var from = E("aup-status-popup");
    for (var node = from.firstChild; node; node = node.nextSibling)
      to.appendChild(fixId(node.cloneNode(true)));
  };
  copyMenu(E("aup-toolbarbutton"));
  copyMenu(aupGetPaletteButton());

  aup.createTimer(aupInitImageManagerHiding, 0);
}

function aupUnload()
{
  prefs.removeListener(aupReloadPrefs);
  filterStorage.removeFilterObserver(aupReloadPrefs);
  filterStorage.removeSubscriptionObserver(aupReloadPrefs);
  aup.getBrowserInWindow(window).removeProgressListener(progressListener);
}

function aupReloadPrefs() {
  var state = prefs.proxyMode;
  var label = aup.getString("status_" + state + "_label");

  var tooltip = E("aup-tooltip");
  if (state && tooltip)
    tooltip.setAttribute("curstate", state);

  var updateElement = function(element) {
    if (!element)
      return;

    if (element.tagName == "statusbarpanel" || element.tagName == "vbox") {
      element.hidden = !prefs.showinstatusbar;

      var labelElement = element.getElementsByTagName("label")[0];
      labelElement.setAttribute("value", label);
    }
    else
      element.hidden = !prefs.showintoolbar;

    // HACKHACK: Show status bar icon in SeaMonkey Mail and Prism instead of toolbar icon
    if (element.hidden && (element.tagName == "statusbarpanel" || element.tagName == "vbox") && (E("msgToolbar") || window.location.host == "webrunner"))
      element.hidden = !prefs.showintoolbar;

    if (currentlyShowingInToolbar != prefs.showintoolbar)
      aupInstallInToolbar();

    currentlyShowingInToolbar = prefs.showintoolbar;

    element.setAttribute("proxyMode", state);
  };

  var status = E("aup-status");
  updateElement(status);
  if (prefs.defaultstatusbaraction == 0)
    status.setAttribute("popup", status.getAttribute("context"));
  else
    status.removeAttribute("popup");

  var button = E("aup-toolbarbutton");
  updateElement(button);
  if (button) {
    if (button.hasAttribute("context") && prefs.defaulttoolbaraction == 0)
    {
      button.setAttribute("popup", button.getAttribute("context"));
      button.removeAttribute("type");
    }
    else
      button.removeAttribute("popup");
  }

  updateElement(aupGetPaletteButton());

  proxy.reloadPrefs();
}

function aupInitImageManagerHiding() {
  if (!aup || typeof aupHideImageManager != "undefined")
    return;

  aupHideImageManager = false;
  if (prefs.hideimagemanager && "@mozilla.org/permissionmanager;1" in Cc) {
    try {
      aupHideImageManager = true;
      var permissionManager = Cc["@mozilla.org/permissionmanager;1"].getService(Ci.nsIPermissionManager);
      var enumerator = permissionManager.enumerator;
      while (aupHideImageManager && enumerator.hasMoreElements()) {
        var item = enumerator.getNext().QueryInterface(Ci.nsIPermission);
        if (item.type == "image" && item.capability == Ci.nsIPermissionManager.DENY_ACTION)
          aupHideImageManager = false;
      }
    } catch(e) {}
  }
}

function aupConfigureKey(key, value) {
  var valid = {
    accel: "accel",
    ctrl: "control",
    control: "control",
    shift: "shift",
    alt: "alt",
    meta: "meta"
  };

  var command = E("aup-command-" + key);
  if (!command)
    return;

  var parts = value.split(/\s+/);
  var modifiers = [];
  var keychar = null;
  var keycode = null;
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].toLowerCase() in valid)
      modifiers.push(parts[i].toLowerCase());
    else if (parts[i].length == 1)
      keychar = parts[i];
    else if ("DOM_VK_" + parts[i].toUpperCase() in Ci.nsIDOMKeyEvent)
      keycode = "VK_" + parts[i].toUpperCase();
  }

  if (keychar || keycode) {
    var element = document.createElement("key");
    element.setAttribute("id", "aup-key-" + key);
    element.setAttribute("command", "aup-command-" + key);
    if (keychar)
      element.setAttribute("key", keychar);
    else
      element.setAttribute("keycode", keycode);
    element.setAttribute("modifiers", modifiers.join(","));

    E("aup-keyset").appendChild(element);
  }
}

/**
 * Handles browser clicks to intercept clicks on aup: links.
 */
function handleLinkClick(/**Event*/ event)
{
  // Ignore right-clicks
  if (event.button == 2)
    return;

  let link = event.target;
  while (link && !(link instanceof Ci.nsIDOMNSHTMLAnchorElement))
    link = link.parentNode;

  if (link && /^aup:\/*subscribe\/*\?(.*)/i.test(link.href)) /* */
  {
    event.preventDefault();
    event.stopPropagation();

    let unescape = Cc["@mozilla.org/intl/texttosuburi;1"].getService(Ci.nsITextToSubURI);

    let params = RegExp.$1.split('&');
    let title = null;
    let url = null;
    for each (let param in params)
    {
      let parts = param.split("=", 2);
      if (parts.length == 2 && parts[0] == 'title')
        title = decodeURIComponent(parts[1]);
      if (parts.length == 2 && parts[0] == 'location')
        url = decodeURIComponent(parts[1]);
    }

    if (url && /\S/.test(url))
    {
      if (!title || !/\S/.test(title))
        title = url;

      var subscription = {url: url, title: title, disabled: false, external: false, autoDownload: true};

      window.openDialog("chrome://autoproxy/content/ui/subscription.xul", "_blank",
                         "chrome,centerscreen,modal", subscription);
    }
  }
}

// Finds the toolbar button in the toolbar palette
function aupGetPaletteButton() {
  var toolbox = E("navigator-toolbox") || E("mail-toolbox");
  if (!toolbox || !("palette" in toolbox) || !toolbox.palette)
    return null;

  for (var child = toolbox.palette.firstChild; child; child = child.nextSibling)
    if (child.id == "aup-toolbarbutton")
      return child;

  return null;
}

// Check whether we installed the toolbar button already
function aupInstallInToolbar() {
  if (!E("aup-toolbarbutton")) {
    var insertBeforeBtn = null;
    var toolbar = E("nav-bar");
    if (!toolbar) {
      insertBeforeBtn = "button-junk";
      toolbar = E("mail-bar");
    }

    if (toolbar && "insertItem" in toolbar) {
      var insertBefore = (insertBeforeBtn ? E(insertBeforeBtn) : null);
      if (insertBefore && insertBefore.parentNode != toolbar)
        insertBefore = null;

      toolbar.insertItem("aup-toolbarbutton", insertBefore, null, false);

      toolbar.setAttribute("currentset", toolbar.currentSet);
      document.persist(toolbar.id, "currentset");

      // HACKHACK: Make sure icon is added to both main window and message window in Thunderbird
      var override = null;
      if (window.location.href == "chrome://messenger/content/messenger.xul")
        override = "chrome://messenger/content/messageWindow.xul#mail-bar";
      else if (window.location.href == "chrome://messenger/content/messageWindow.xul")
        override = "chrome://messenger/content/messenger.xul#mail-bar";

      if (override) {
        try {
          var rdf = Cc["@mozilla.org/rdf/rdf-service;1"].getService(Ci.nsIRDFService);
          var localstore = rdf.GetDataSource("rdf:local-store");
          var resource = rdf.GetResource(override);
          var arc = rdf.GetResource("currentset");
          var target = localstore.GetTarget(resource, arc, true);
          var currentSet = (target ? target.QueryInterface(Ci.nsIRDFLiteral).Value : E('mail-bar').getAttribute("defaultset"));

          if (/\bbutton-junk\b/.test(currentSet))
            currentSet = currentSet.replace(/\bbutton-junk\b/, "aup-toolbarbutton,button-junk");
          else
            currentSet = currentSet + ",aup-toolbarbutton";

          if (target)
            localstore.Unassert(resource, arc, target, true);
          localstore.Assert(resource, arc, rdf.GetLiteral(currentSet), true);
        } catch (e) {}
      }
    }
  }
}

// Let user choose subscriptions on first start unless he has some already
function aupShowSubscriptions()
{
  // Look for existing subscriptions
  for each (let subscription in filterStorage.subscriptions)
    if (subscription instanceof aup.DownloadableSubscription)
      return;
  window.openDialog("chrome://autoproxy/content/ui/tip_subscriptions.xul", "_blank", "chrome,centerscreen,resizable,dialog=no");
}

function aupFillTooltip(event) {
  if (!document.tooltipNode || !document.tooltipNode.hasAttribute("tooltip"))
  {
    event.preventDefault();
    return;
  }

  var type = (document.tooltipNode && document.tooltipNode.id == "aup-toolbarbutton" ? "toolbar" : "statusbar");
  var action = parseInt(prefs["default" + type + "action"]);
  if (isNaN(action))
    action = -1;

  var actionDescr = E("aup-tooltip-action");
  actionDescr.hidden = (action < 0 || action > 3);
  if (!actionDescr.hidden)
    actionDescr.setAttribute("value", aup.getString("action" + action + "_tooltip"));

  var state = event.target.getAttribute("curstate");
  var statusDescr = E("aup-tooltip-status");
  statusDescr.setAttribute("value", aup.getString(state + "_tooltip"));

  var activeFilters = [];
  E("aup-tooltip-blocked-label").hidden = (state != "auto");
  E("aup-tooltip-blocked").hidden = (state != "auto");
  if (state == "auto") {
    var locations = [];
    var rootData = aup.getDataForWindow(window);
    var rootCurrentData = rootData.getLocation(6, aup.getBrowserInWindow(window).currentURI.spec);
    if (rootCurrentData) locations.push(rootCurrentData);
    var data = aup.getDataForWindow( aup.getBrowserInWindow(window).contentWindow );
    data.getAllLocations(locations);

    var blocked = 0;
    var filterCount = {__proto__: null};
    for (i = 0; i < locations.length; i++) {
      if (locations[i].filter && !(locations[i].filter instanceof aup.WhitelistFilter))
        blocked++;
      if (locations[i].filter) {
        if (locations[i].filter.text in filterCount)
          filterCount[locations[i].filter.text]++;
        else
          filterCount[locations[i].filter.text] = 1;
      }
    }

    var blockedStr = aup.getString("blocked_count_tooltip");
    blockedStr = blockedStr.replace(/--/, blocked).replace(/--/, locations.length);
    E("aup-tooltip-blocked").setAttribute("value", blockedStr);

    var filterSort = function(a, b) {
      return filterCount[b] - filterCount[a];
    };
    for (var filter in filterCount)
      activeFilters.push(filter);
    activeFilters = activeFilters.sort(filterSort);
  }

  E("aup-tooltip-filters-label").hidden = (activeFilters.length == 0);
  E("aup-tooltip-filters").hidden = (activeFilters.length == 0);
  if (activeFilters.length > 0) {
    var filtersContainer = E("aup-tooltip-filters");
    while (filtersContainer.firstChild)
      filtersContainer.removeChild(filtersContainer.firstChild);

    for (var i = 0; i < activeFilters.length && i < 3; i++) {
      var descr = document.createElement("description");
      descr.setAttribute("value", activeFilters[i] + " (" + filterCount[activeFilters[i]] + ")");
      filtersContainer.appendChild(descr);
    }
    if (activeFilters.length > 3) {
      var descr = document.createElement("description");
      descr.setAttribute("value", "...");
      filtersContainer.appendChild(descr);
    }
  }
}

/**
 * Retrieves the current location of the browser (might return null on failure).
 */
function getCurrentLocation() /**nsIURI*/
{
  if ("currentHeaderData" in window && "content-base" in currentHeaderData)
  {
    // Thunderbird blog entry
    return aup.unwrapURL(window.currentHeaderData["content-base"].headerValue);
  }
  else if ("gDBView" in window)
  {
    // Thunderbird mail/newsgroup entry
    try
    {
      let msgHdr = gDBView.hdrForFirstSelectedMessage;
      let headerParser = Cc["@mozilla.org/messenger/headerparser;1"].getService(Ci.nsIMsgHeaderParser);
      let emailAddress = headerParser.extractHeaderAddressMailboxes(null, msgHdr.author);
      return "mailto:" + emailAddress.replace(/^[\s"]+/, "").replace(/[\s"]+$/, "").replace(/\s/g, "%20");
    }
    catch(e)
    {
      return null;
    }
  }
  else
  {
    // Regular browser
    return aup.unwrapURL(aup.getBrowserInWindow(window).contentWindow.location.href);
  }
}

// Fills the context menu on the status bar
function aupFillPopup(event) {
  let popup = event.target;

  // Not at-target call, ignore
  if (popup.getAttribute("id").indexOf("options") >= 0)
    return;

  // Need to do it this way to prevent a Gecko bug from striking
  var elements = {};
  var list = popup.getElementsByTagName("menuitem");
  for (var i = 0; i < list.length; i++)
    if (list[i].id && /\-(\w+)$/.test(list[i].id))
      elements[RegExp.$1] = list[i];

  var sidebarOpen = aupIsSidebarOpen();
  elements.opensidebar.hidden = sidebarOpen;
  elements.closesidebar.hidden = !sidebarOpen;

  var whitelistItemSite = elements.whitelistsite;
  whitelistItemSite.hidden = true;

  var whitelistSeparator = whitelistItemSite.nextSibling;
  while (whitelistSeparator.nodeType != whitelistSeparator.ELEMENT_NODE)
    whitelistSeparator = whitelistSeparator.nextSibling;

  let location = getCurrentLocation();
  if (location && proxy.isProxyableScheme(location))
  {
    let host = location.host.replace(/^www\./, "");

    if (host)
    {
      siteWhitelist = aup.Filter.fromText("@@||" + host + "^$document");
      whitelistItemSite.setAttribute("checked", isUserDefinedFilter(siteWhitelist));
      whitelistItemSite.setAttribute("label", whitelistItemSite.getAttribute("labeltempl").replace(/--/, host));
      whitelistItemSite.hidden = false;
    }
  }
  whitelistSeparator.hidden = whitelistItemSite.hidden;

  elements.showintoolbar.setAttribute("checked", prefs.showintoolbar);
  elements.showinstatusbar.setAttribute("checked", prefs.showinstatusbar);

  var defAction = (popup.tagName == "menupopup" || document.popupNode.id == "aup-toolbarbutton" ? prefs.defaulttoolbaraction : prefs.defaultstatusbaraction);
  elements.opensidebar.setAttribute("default", defAction == 1);
  elements.closesidebar.setAttribute("default", defAction == 1);
  elements.settings.setAttribute("default", defAction == 2);

  elements.modeauto.setAttribute("checked", "auto" == prefs.proxyMode);
  elements.modeglobal.setAttribute("checked", "global" == prefs.proxyMode);
  elements.modedisabled.setAttribute("checked", "disabled" == prefs.proxyMode);

  var menu = null;
  if (popup.id == "aup-toolbar-popup")
    menu = E("aup-toolbar-switchProxy");
  else if (popup.id == "aup-status-popup")
    menu = E("aup-status-switchProxy");
  else return;

  var popup = document.createElement("menupopup");
  popup.id = "options-switchProxy";
  if (menu.children.length == 1) menu.removeChild(menu.children[0]);
  menu.appendChild(popup);

  for each (var p in proxy.getName) {
    var item = document.createElement('menuitem');
    item.setAttribute('type', 'radio');
    item.setAttribute('label', p);
    item.setAttribute('value', p);
    item.setAttribute('name', 'radioGroup-switchProxy');
    item.addEventListener("command", switchDefaultProxy, false);
    if (proxy.nameOfDefaultProxy == p) item.setAttribute('checked', true);
    popup.appendChild(item);
  }
}

// Only show context menu on toolbar button in vertical toolbars
function aupCheckToolbarContext(event) {
  var toolbox = event.target;
  while (toolbox && toolbox.tagName != "toolbox")
    toolbox = toolbox.parentNode;

  if (!toolbox || toolbox.getAttribute("vertical") != "true")
    return;

  event.target.open = true;
  event.preventDefault();
}

function aupIsSidebarOpen() {
  // Test whether detached sidebar window is open
  if (window.aupDetachedSidebar && !window.aupDetachedSidebar.closed)
    return true;

  var sidebar = E("aup-sidebar");
  return (sidebar ? !sidebar.hidden : false);
}

function aupToggleSidebar() {
  if (window.aupDetachedSidebar && !window.aupDetachedSidebar.closed)
    window.aupDetachedSidebar.close();
  else {
    var sidebar = E("aup-sidebar");
    if (sidebar && (!prefs.detachsidebar || !sidebar.hidden)) {
      E("aup-sidebar-splitter").hidden = !sidebar.hidden;
      E("aup-sidebar-browser").setAttribute("src", sidebar.hidden ? "chrome://autoproxy/content/ui/sidebar.xul" : "about:blank");
      sidebar.hidden = !sidebar.hidden;
    }
    else
      window.aupDetachedSidebar = window.openDialog("chrome://autoproxy/content/ui/sidebarDetached.xul", "_blank", "chrome,resizable,dependent,dialog=no,width=600,height=300");
  }

  let menuItem = E("aup-blockableitems");
  if (menuItem)
    menuItem.setAttribute("checked", aupIsSidebarOpen());
}

/**
 * Checks whether the specified filter exists as a user-defined filter in the list.
 *
 * @param {String} filter   text representation of the filter
 */
function isUserDefinedFilter(/**Filter*/ filter)  /**Boolean*/
{
  return filter.subscriptions.some(function(subscription) { return subscription instanceof aup.SpecialSubscription; });
}

// Toggles the value of a boolean pref
function aupTogglePref(pref) {
  prefs[pref] = !prefs[pref];
  prefs.save();
}

/**
 * If the given filter is already in user's list, removes it from the list. Otherwise adds it.
 */
function toggleFilter(/**Filter*/ filter)
{
  if (isUserDefinedFilter(filter))
    filterStorage.removeFilter(filter);
  else
    filterStorage.addFilter(filter);
  filterStorage.saveToDisk();
}

// Handle clicks on the statusbar panel
function aupClickHandler(e)
{
  if (e.button == 0)
    aupExecuteAction(prefs.defaultstatusbaraction,e);
  else if (e.button == 1) {
    prefs.proxyMode = proxy.mode[ (proxy.mode.indexOf(prefs.proxyMode)+1) % 3 ];
    prefs.save();
  }
}

function aupCommandHandler(e)
{
  if (prefs.defaulttoolbaraction == 0)
    e.target.open = true;
  else
    aupExecuteAction(prefs.defaulttoolbaraction, e);
}

// Executes default action for statusbar/toolbar by its number
function aupExecuteAction(action, e)
{
  switch (action) {
    case 0:
      aupFillPopup(e);
      break;
    case 1: //proxyable items
      aupToggleSidebar();
      break;
    case 2: //preference
      aup.openSettingsDialog();
      break;
    case 3: //quick add
      break;
    case 4: //cycle default proxy
      if (aup.proxyTipTimer) aup.proxyTipTimer.cancel();
      prefs.defaultProxy = (prefs.defaultProxy + 1) % proxy.server.length;
      prefs.save();
      //show tooltip
      let tooltip = E("showCurrentProxy");
      let tooltipLabel = E("showCurrentProxyValue");
      tooltipLabel.value = proxy.nameOfDefaultProxy;
      if (e.screenX && e.screenY)
        tooltip.openPopupAtScreen(e.screenX, e.screenY, false);
      else
        tooltip.openPopupAtScreen(e.target.boxObject.screenX, e.target.boxObject.screenY, false);
      aup.proxyTipTimer = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
      aup.proxyTipTimer.initWithCallback( {notify:function(){tooltip.hidePopup();}}, 2500, Components.interfaces.nsITimer.TYPE_ONE_SHOT );
      break;
    case 5: //default proxy menu
      let popup = document.getElementById("aup-popup-switchProxy");
      while (popup.firstChild) popup.removeChild(popup.lastChild);
      for each (let p in proxy.getName) {
        let item = document.createElement('menuitem');
        item.setAttribute('type', 'radio');
        item.setAttribute('label', p);
        item.setAttribute('value', p);
        item.setAttribute('name', 'radioGroup-switchProxy');
        item.addEventListener("command", switchDefaultProxy, false);
        if (proxy.nameOfDefaultProxy == p) item.setAttribute('checked', true);
        popup.appendChild(item);
      }
      if(e.screenX&&e.screenY) popup.openPopupAtScreen(e.screenX, e.screenY, false);
      else popup.openPopupAtScreen(e.target.boxObject.screenX, e.target.boxObject.screenY, false);
      break;
    default:
      break;
  }
}

// Retrieves the image URL for the specified style property
function aupImageStyle(computedStyle, property)
{
  var value = computedStyle.getPropertyCSSValue(property);
  if (value instanceof Ci.nsIDOMCSSValueList && value.length >= 1)
    value = value[0];
  if (value instanceof Ci.nsIDOMCSSPrimitiveValue && value.primitiveType == Ci.nsIDOMCSSPrimitiveValue.CSS_URI)
    return aup.unwrapURL(value.getStringValue()).spec;

  return null;
}

function switchDefaultProxy(event)
{
  var value = event.target.value;
  if ( proxy.nameOfDefaultProxy != value ) {
    prefs.defaultProxy = proxy.getName.indexOf(value);
    prefs.save();
  }
}
