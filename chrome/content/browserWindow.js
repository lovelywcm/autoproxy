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
 *
 * ***** END LICENSE BLOCK ***** */

var aup = null;
try {
  aup = Components.classes["@mozilla.org/autoproxy;1"].createInstance().wrappedJSObject;

  if (!aup.prefs.initialized)
    aup = null;
} catch (e) {}

var aupPrefs = aup ? aup.prefs : {enabled: false};
var aupDetachedSidebar = null;
var aupOldShowInToolbar = aupPrefs.showintoolbar;
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
  ["aup-command-togglepagewhitelist", "command", function() { toggleFilter(pageWhitelist); }],
  ["aup-command-toggleobjtabs", "command", function() { aupTogglePref("frameobjects"); }],
  ["aup-command-togglecollapse", "command", function() { aupTogglePref("fastcollapse"); }],
  ["aup-command-toggleshowintoolbar", "command", function() { aupTogglePref("showintoolbar"); }],
  ["aup-command-toggleshowinstatusbar", "command", function() { aupTogglePref("showinstatusbar"); }],
  ["aup-command-enable", "command", function() { aupTogglePref("enabled"); }]
];

/**
 * Filter corresponding with "disable on site" menu item (set in aupFillPopup()).
 * @type Filter
 */
let siteWhitelist = null;
/**
 * Filter corresponding with "disable on site" menu item (set in aupFillPopup()).
 * @type Filter
 */
let pageWhitelist = null;

/**
 * Timer triggering UI reinitialization in regular intervals.
 * @type nsITimer
 */
let prefReloadTimer = null;

aupInit();

function E(id)
{
  return document.getElementById(id);
}

function aupInit() {

  // Process preferences
  aupReloadPrefs();
  if (aup) {
    // Register event listeners
    window.addEventListener("unload", aupUnload, false);
    for each (let [id, event, handler] in eventHandlers)
    {
      let element = E(id);
      if (element)
        element.addEventListener(event, handler, false);
    }

    aupPrefs.addListener(aupReloadPrefs);

    // Make sure whitelisting gets displayed after at most 2 seconds
    prefReloadTimer = aup.createTimer(aupReloadPrefs, 2000);
    prefReloadTimer.type = prefReloadTimer.TYPE_REPEATING_SLACK;

    aupGetBrowser().addEventListener("select", aupReloadPrefs, false); 

    // Make sure we always configure keys but don't let them break anything
    try {
      // Configure keys
      for (var key in aupPrefs)
        if (key.match(/(.*)_key$/))
          aupConfigureKey(RegExp.$1, aupPrefs[key]);
    } catch(e) {}
  }

  // Install context menu handler
  var contextMenu = E("contentAreaContextMenu") || E("messagePaneContext") || E("popup_content");
  if (contextMenu) {
    contextMenu.addEventListener("popupshowing", aupCheckContext, false);
  
    // Make sure our context menu items are at the bottom
    contextMenu.appendChild(E("aup-frame-menuitem"));
    contextMenu.appendChild(E("aup-object-menuitem"));
    contextMenu.appendChild(E("aup-image-menuitem"));
  }

  // First run actions
  if (aup && !("doneFirstRunActions" in aupPrefs) && aup.versionComparator.compare(aupPrefs.lastVersion, "0.0") <= 0)
  {
    // Don't repeat first run actions if new window is opened
    aupPrefs.doneFirstRunActions = true;

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

function aupUnload() {
  aupPrefs.removeListener(aupReloadPrefs);
  aupGetBrowser().removeEventListener("select", aupReloadPrefs, false); 
}

function aupGetBrowser() {
  if ("getBrowser" in window)
    return window.getBrowser();
  else if ("messageContent" in window)
    return window.messageContent;
  else
    return E("frame_main_pane") || E("browser_content");
}

function aupReloadPrefs() {
  var label;
  var state = null;
  if (aup) {
    if (aupPrefs.enabled)
      state = "active";
    else
      state = "disabled";

    label = aup.getString("status_" + state + "_label");

    if (state == "active")
    {
      let location = getCurrentLocation();
      if (location && aup.policy.isWhitelisted(location.spec))
        state = "whitelisted";
    }
  }

  var tooltip = E("aup-tooltip");
  if (state && tooltip)
    tooltip.setAttribute("curstate", state);

  var updateElement = function(element) {
    if (!element)
      return;

    if (aup) {
      element.removeAttribute("disabled");

      if (element.tagName == "statusbarpanel" || element.tagName == "vbox") {
        element.hidden = !aupPrefs.showinstatusbar;

        var labelElement = element.getElementsByTagName("label")[0];
        labelElement.setAttribute("value", label);
      }
      else
        element.hidden = !aupPrefs.showintoolbar;

      // HACKHACK: Show status bar icon in SeaMonkey Mail and Prism instead of toolbar icon
      if (element.hidden && (element.tagName == "statusbarpanel" || element.tagName == "vbox") && (E("msgToolbar") || location.host == "webrunner"))
        element.hidden = !aupPrefs.showintoolbar;

      if (aupOldShowInToolbar != aupPrefs.showintoolbar)
        aupInstallInToolbar();

      aupOldShowInToolbar = aupPrefs.showintoolbar;
    }

    element.removeAttribute("deactivated");
    element.removeAttribute("whitelisted");
    if (state == "whitelisted")
      element.setAttribute("whitelisted", "true");
    else if (state == "disabled")
      element.setAttribute("deactivated", "true");
  };

  var status = E("aup-status");
  updateElement(status);
  if (aupPrefs.defaultstatusbaraction == 0)
    status.setAttribute("popup", status.getAttribute("context"));
  else
    status.removeAttribute("popup");

  var button = E("aup-toolbarbutton");
  updateElement(button);
  if (button) {
    if (button.hasAttribute("context") && aupPrefs.defaulttoolbaraction == 0)
    {
      button.setAttribute("popup", button.getAttribute("context"));
      button.removeAttribute("type");
    }
    else
      button.removeAttribute("popup");
  }

  updateElement(aupGetPaletteButton());
}

function aupInitImageManagerHiding() {
  if (!aup || typeof aupHideImageManager != "undefined")
    return;

  aupHideImageManager = false;
  if (aupPrefs.hideimagemanager && "@mozilla.org/permissionmanager;1" in Components.classes) {
    try {
      aupHideImageManager = true;
      var permissionManager = Components.classes["@mozilla.org/permissionmanager;1"]
                                        .getService(Components.interfaces.nsIPermissionManager);
      var enumerator = permissionManager.enumerator;
      while (aupHideImageManager && enumerator.hasMoreElements()) {
        var item = enumerator.getNext().QueryInterface(Components.interfaces.nsIPermission);
        if (item.type == "image" && item.capability == Components.interfaces.nsIPermissionManager.DENY_ACTION)
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
    else if ("DOM_VK_" + parts[i].toUpperCase() in Components.interfaces.nsIDOMKeyEvent)
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
          var rdf = Components.classes["@mozilla.org/rdf/rdf-service;1"]
                              .getService(Components.interfaces.nsIRDFService);
          var localstore = rdf.GetDataSource("rdf:local-store");
          var resource = rdf.GetResource(override);
          var arc = rdf.GetResource("currentset");
          var target = localstore.GetTarget(resource, arc, true);
          var currentSet = (target ? target.QueryInterface(Components.interfaces.nsIRDFLiteral).Value : E('mail-bar').getAttribute("defaultset"));

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
  for each (let subscription in aup.filterStorage.subscriptions)
    if (subscription instanceof aup.DownloadableSubscription)
      return;
  openDialog("chrome://autoproxy/content/tip_subscriptions.xul", "_blank", "chrome, centerscreen");
}

function aupFillTooltip(event) {
  if (!document.tooltipNode || !document.tooltipNode.hasAttribute("tooltip"))
  {
    event.preventDefault();
    return;
  }

  aupReloadPrefs();

  var type = (document.tooltipNode && document.tooltipNode.id == "aup-toolbarbutton" ? "toolbar" : "statusbar");
  var action = parseInt(aupPrefs["default" + type + "action"]);
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
  E("aup-tooltip-blocked-label").hidden = (state != "active");
  E("aup-tooltip-blocked").hidden = (state != "active");
  if (state == "active") {
    var data = aup.getDataForWindow(aupGetBrowser().contentWindow);
    var locations = data.getAllLocations();

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
      let headerParser = Components.classes["@mozilla.org/messenger/headerparser;1"]
                                   .getService(Components.interfaces.nsIMsgHeaderParser);
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
    return aup.unwrapURL(aupGetBrowser().contentWindow.location.href);
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
  var whitelistItemPage = elements.whitelistpage;
  whitelistItemSite.hidden = whitelistItemPage.hidden = true;

  var whitelistSeparator = whitelistItemPage.nextSibling;
  while (whitelistSeparator.nodeType != whitelistSeparator.ELEMENT_NODE)
    whitelistSeparator = whitelistSeparator.nextSibling;

  let location = getCurrentLocation();
  if (location && aup.policy.isBlockableScheme(location))
  {
    let host = null;
    try
    {
      host = location.host;
    } catch (e) {}

    if (host)
    {
      let ending = "|";
      if (location instanceof Components.interfaces.nsIURL && location.ref)
        location.ref = "";
      if (location instanceof Components.interfaces.nsIURL && location.query)
      {
        location.query = "";
        ending = "?";
      }

      siteWhitelist = aup.Filter.fromText("@@|" + location.prePath + "/");
      whitelistItemSite.setAttribute("checked", isUserDefinedFilter(siteWhitelist));
      whitelistItemSite.setAttribute("label", whitelistItemSite.getAttribute("labeltempl").replace(/--/, host));
      whitelistItemSite.hidden = false;

      pageWhitelist = aup.Filter.fromText("@@|" + location.spec + ending);
      whitelistItemPage.setAttribute("checked", isUserDefinedFilter(pageWhitelist));
      whitelistItemPage.hidden = false;
    }
    else
    {
      siteWhitelist = aup.Filter.fromText("@@|" + location.spec + "|");
      whitelistItemSite.setAttribute("checked", isUserDefinedFilter(siteWhitelist));
      whitelistItemSite.setAttribute("label", whitelistItemSite.getAttribute("labeltempl").replace(/--/, location.spec.replace(/^mailto:/, "")));
      whitelistItemSite.hidden = false;
    }
  }
  whitelistSeparator.hidden = whitelistItemSite.hidden && whitelistItemPage.hidden;

  elements.enabled.setAttribute("checked", aupPrefs.enabled);
  elements.showintoolbar.setAttribute("checked", aupPrefs.showintoolbar);
  elements.showinstatusbar.setAttribute("checked", aupPrefs.showinstatusbar);

  var defAction = (popup.tagName == "menupopup" || document.popupNode.id == "aup-toolbarbutton" ? aupPrefs.defaulttoolbaraction : aupPrefs.defaultstatusbaraction);
  elements.opensidebar.setAttribute("default", defAction == 1);
  elements.closesidebar.setAttribute("default", defAction == 1);
  elements.settings.setAttribute("default", defAction == 2);
  elements.enabled.setAttribute("default", defAction == 3);
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
  if (aupDetachedSidebar && !aupDetachedSidebar.closed)
    return true;

  var sidebar = E("aup-sidebar");
  return (sidebar ? !sidebar.hidden : false);
}

function aupToggleSidebar() {
  if (!aup)
    return;

  if (aupDetachedSidebar && !aupDetachedSidebar.closed)
    aupDetachedSidebar.close();
  else {
    var sidebar = E("aup-sidebar");
    if (sidebar && (!aupPrefs.detachsidebar || !sidebar.hidden)) {
      E("aup-sidebar-splitter").hidden = !sidebar.hidden;
      E("aup-sidebar-browser").setAttribute("src", sidebar.hidden ? "chrome://autoproxy/content/sidebar.xul" : "about:blank");
      sidebar.hidden = !sidebar.hidden;
    }
    else
      aupDetachedSidebar = window.openDialog("chrome://autoproxy/content/sidebarDetached.xul", "_blank", "chrome,resizable,dependent,dialog=no,width=600,height=300");
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
  if (!aup)
    return;

  aupPrefs[pref] = !aupPrefs[pref];
  aupPrefs.save();
}

/**
 * If the given filter is already in user's list, removes it from the list. Otherwise adds it.
 */
function toggleFilter(/**Filter*/ filter)
{
  if (isUserDefinedFilter(filter))
    aup.filterStorage.removeFilter(filter);
  else
    aup.filterStorage.addFilter(filter);
  aup.filterStorage.saveToDisk();

  // Make sure to display whitelisting immediately
  aupReloadPrefs();
}

// Handle clicks on the statusbar panel
function aupClickHandler(e) {
  if (e.button == 0)
    aupExecuteAction(aupPrefs.defaultstatusbaraction);
  else if (e.button == 1)
    aupTogglePref("enabled");
}

function aupCommandHandler(e) {
  if (aupPrefs.defaulttoolbaraction == 0)
    e.target.open = true;
  else
    aupExecuteAction(aupPrefs.defaulttoolbaraction);
}

// Executes default action for statusbar/toolbar by its number
function aupExecuteAction(action) {
  if (action == 1)
    aupToggleSidebar();
  else if (action == 2)
    aup.openSettingsDialog();
  else if (action == 3)
    aupTogglePref("enabled");
}

// Retrieves the image URL for the specified style property
function aupImageStyle(computedStyle, property) {
  var value = computedStyle.getPropertyCSSValue(property);
  if (value.primitiveType == value.CSS_URI)
    return aup.unwrapURL(value.getStringValue()).spec;

  return null;
}

// Hides the unnecessary context menu items on display
function aupCheckContext() {
  var contextMenu = E("contentAreaContextMenu") || E("messagePaneContext") || E("popup_content");
  var target = document.popupNode;

  var nodeType = null;
  contextMenu.aupBgData = null;
  contextMenu.aupFrameData = null;
  if (aup && target) {
    // Lookup the node in our stored data
    var data = aup.getDataForNode(target);
    var targetNode = null;
    if (data) {
      targetNode = data[0];
      data = data[1];
    }
    contextMenu.aupData = data;
    if (data && !data.filter)
      nodeType = data.typeDescr;

    var wnd = (target ? target.ownerDocument.defaultView : null);
    var wndData = (wnd ? aup.getDataForWindow(wnd) : null);

    if (wnd.frameElement)
      contextMenu.aupFrameData = aup.getDataForNode(wnd.frameElement, true);
    if (contextMenu.aupFrameData)
      contextMenu.aupFrameData = contextMenu.aupFrameData[1];
    if (contextMenu.aupFrameData && contextMenu.aupFrameData.filter)
      contextMenu.aupFrameData = null;

    if (nodeType != "IMAGE") {
      // Look for a background image
      var imageNode = target;
      while (imageNode && !contextMenu.aupBgData) {
        if (imageNode.nodeType == imageNode.ELEMENT_NODE) {
          var bgImage = null;
          var style = wnd.getComputedStyle(imageNode, "");
          bgImage = aupImageStyle(style, "background-image") || aupImageStyle(style, "list-style-image");
          if (bgImage) {
            contextMenu.aupBgData = wndData.getLocation(aup.policy.type.BACKGROUND, bgImage);
            if (contextMenu.aupBgData && contextMenu.aupBgData.filter)
              contextMenu.aupBgData = null;
          }
        }

        imageNode = imageNode.parentNode;
      }
    }

    // Hide "Block Images from ..." if hideimagemanager pref is true and the image manager isn't already blocking something
    var imgManagerContext = E("context-blockimage");
    if (imgManagerContext) {
      if (typeof aupHideImageManager == "undefined")
        aupInitImageManagerHiding();

      // Don't use "hidden" attribute - it might be overridden by the default popupshowing handler
      imgManagerContext.style.display = (aupHideImageManager ? "none" : "");
    }
  }

  E("aup-image-menuitem").hidden = (nodeType != "IMAGE" && contextMenu.aupBgData == null);
  E("aup-object-menuitem").hidden = (nodeType != "OBJECT");
  E("aup-frame-menuitem").hidden = (contextMenu.aupFrameData == null);
}

// Bring up the settings dialog for the node the context menu was referring to
function aupNode(data) {
  if (aup && data)
    window.openDialog("chrome://autoproxy/content/composer.xul", "_blank", "chrome,centerscreen,resizable,dialog=no,dependent", aupGetBrowser().contentWindow, data);
}
