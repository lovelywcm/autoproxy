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

var RequestList = aup.RequestList;

// Main browser window
var mainWin = parent;

// The window handler currently in use
var wndData = null;

var cacheSession = null;
var noFlash = false;

// Matchers for disabled filters
var disabledBlacklistMatcher = new aup.Matcher();
var disabledWhitelistMatcher = new aup.Matcher();

var aupHooks = null;

function init() {
  var list = E("list");
  list.view = treeView;

  // Restore previous state
  var params = aup.getParams();
  if (params && params.search) {
    E("searchField").value = params.search;
    treeView.setFilter(params.search);
  }
  if (params && params.focus && E(params.focus))
    E(params.focus).focus();
  else
    E("searchField").focus();

  var selected = null;
  if (/sidebarDetached\.xul$/.test(parent.location.href)) {
    mainWin = parent.opener;
    mainWin.addEventListener("unload", mainUnload, false);
    E("detachButton").hidden = true;
    E("reattachButton").hidden = false;
    if (!mainWin.document.getElementById("aup-sidebar"))
      E("reattachButton").setAttribute("disabled", "true");
    if (mainWin.document.getElementById("aup-key-sidebar")) {
      var sidebarKey = mainWin.document.getElementById("aup-key-sidebar").cloneNode(true);
      parent.document.getElementById("detached-keyset").appendChild(parent.document.importNode(sidebarKey, true));
    }

    // Set default size/position unless already persisted
    let defaults = {screenX: 0, screenY: 0, width: 600, height: 300};
    if (params && params.position)
      defaults = params.position;

    let wnd = parent.document.documentElement;
    for (let attr in defaults)
      if (!wnd.hasAttribute(attr))
        wnd.setAttribute(attr, defaults[attr]);
  }

  aupHooks = mainWin.document.getElementById("aup-hooks");
  window.__defineGetter__("content", function() {return aupHooks.getBrowser().contentWindow;});

  // Install item listener
  RequestList.addListener(handleItemChange);

  // Initialize matchers for disabled filters
  reloadDisabledFilters();
  filterStorage.addFilterObserver(reloadDisabledFilters);
  filterStorage.addSubscriptionObserver(reloadDisabledFilters);

  // Activate flasher
  list.addEventListener("select", onSelectionChange, false);

  // Retrieve data for the window
  wndData = RequestList.getDataForWindow(window.content);
  var locations=[];
  var rootCurrentData = RequestList.getDataForWindow(mainWin)
          .getLocation(6, aupHooks.getBrowser().currentURI.spec);
  if(rootCurrentData) locations.push(rootCurrentData);
  treeView.setData(wndData.getAllLocations(locations));
  if (wndData.lastSelection) {
    noFlash = true;
    treeView.selectItem(wndData.lastSelection);
    noFlash = false;
  }

  // Install a handler for tab changes
  aupHooks.getBrowser().addEventListener("select", handleTabChange, false);
}

// To be called for a detached window when the main window has been closed
function mainUnload() {
  parent.close();
}

// To be called on unload
function cleanUp() {
  if (!aup)
    return;

  flasher.stop();
  RequestList.removeListener(handleItemChange);
  filterStorage.removeFilterObserver(reloadDisabledFilters);
  filterStorage.removeSubscriptionObserver(reloadDisabledFilters);

  aupHooks.getBrowser().removeEventListener("select", handleTabChange, false);
  mainWin.removeEventListener("unload", mainUnload, false);
}

/**
 * Updates matchers for disabled filters (global disabledBlacklistMatcher and
 * disabledWhitelistMatcher variables), called on each filter change.
 */
function reloadDisabledFilters()
{
  disabledBlacklistMatcher.clear();
  disabledWhitelistMatcher.clear();

  for each (let subscription in filterStorage.subscriptions)
  {
    if (subscription.disabled)
      continue;

    for each (let filter in subscription.filters)
      if (filter instanceof aup.RegExpFilter && filter.disabled)
        (filter instanceof aup.BlockingFilter ? disabledBlacklistMatcher : disabledWhitelistMatcher).add(filter);
  }
}

// Called whenever list selection changes - triggers flasher
function onSelectionChange() {
  var item = treeView.getSelectedItem();
  if (item)
    E("copy-command").removeAttribute("disabled");
  else
    E("copy-command").setAttribute("disabled", "true");
  if (item && wndData)
    wndData.lastSelection = item;

  if (!noFlash)
    flasher.flash(item ? item.nodes : null);
}

function handleItemChange(wnd, type, data, item) {
  // Check whether this applies to us
  if (wnd != window.content)
    return;

  // Maybe we got called twice
  if (type == "select" && data == wndData)
    return;

  // If adding something from a new data container - select it
  if (type == "add" && data != wndData)
    type = "select";

  var i;
  var filterSuggestions = E("suggestionsList");
  if (type == "clear") {
    // Current document has been unloaded, clear list
    wndData = null;
    treeView.setData([]);
  }
  else if (type == "select" || type == "refresh") {
    // We moved to a different document, reload list
    wndData = data;
    var locations=[];
    var rootCurrentData = RequestList.getDataForWindow(mainWin)
            .getLocation(6, aupHooks.getBrowser().currentURI.spec);
    if(rootCurrentData) locations.push(rootCurrentData);
    treeView.setData(wndData.getAllLocations(locations));
  }
  else if (type == "invalidate")
    treeView.boxObject.invalidate();
  else if (type == "add")
    treeView.addItem(item);
}

function handleTabChange() {
  wndData = RequestList.getDataForWindow(window.content);
  var locations=[];
  var rootCurrentData = RequestList.getDataForWindow(mainWin)
          .getLocation(6, aupHooks.getBrowser().currentURI.spec);
  if(rootCurrentData) locations.push(rootCurrentData);
  treeView.setData(wndData.getAllLocations(locations));
  if (wndData.lastSelection) {
    noFlash = true;
    treeView.selectItem(wndData.lastSelection);
    noFlash = false;
  }
}

// Fills a box with text splitting it up into multiple lines if necessary
function setMultilineContent(box, text, noRemove)
{
  if (!noRemove)
    while (box.firstChild)
      box.removeChild(box.firstChild);

  for (var i = 0; i < text.length; i += 80)
  {
    var description = document.createElement("description");
    description.setAttribute("value", text.substr(i, 80));
    box.appendChild(description);
  }
}

// Fill in tooltip data before showing it
function fillInTooltip(e) {
  var item;
  if (treeView.data && !treeView.data.length)
    item = treeView.getDummyTooltip();
  else
    item = treeView.getItemAt(e.clientX, e.clientY);

  if (!item)
    return false;

  let filter = ("filter" in item && item.filter && !item.filter.disabled ? item.filter : null);
  let size = ("tooltip" in item ? null : getItemSize(item));
  let subscriptions = (filter ? filter.subscriptions.filter(function(subscription) { return !subscription.disabled; }) : []);

  E("tooltipDummy").hidden = !("tooltip" in item);
  E("tooltipAddressRow").hidden = ("tooltip" in item);
  E("tooltipTypeRow").hidden = ("tooltip" in item);
  E("tooltipSizeRow").hidden = !size;
  E("tooltipDocDomainRow").hidden = ("tooltip" in item || !item.docDomain);
  E("tooltipFilterRow").hidden = !filter;
  E("tooltipFilterSourceRow").hidden = !subscriptions.length;

  if ("tooltip" in item)
    E("tooltipDummy").setAttribute("value", item.tooltip);
  else
  {
    setMultilineContent(E("tooltipAddress"), item.location);
  
    var type = item.localizedDescr;
    if (filter && filter instanceof aup.WhitelistFilter)
      type += " " + E("tooltipType").getAttribute("whitelisted");
    else if (filter)
      type += " " + E("tooltipType").getAttribute("filtered");
    E("tooltipType").setAttribute("value", type);

    if (size)
      E("tooltipSize").setAttribute("value", size.join(" x "));

    E("tooltipDocDomain").setAttribute("value", item.docDomain);
  }

  if (filter)
  {
    setMultilineContent(E("tooltipFilter"), filter.text);
    if (subscriptions.length)
    {
      let sourceElement = E("tooltipFilterSource");
      while (sourceElement.firstChild)
        sourceElement.removeChild(sourceElement.firstChild);
      for each (let subscription in subscriptions)
        setMultilineContent(sourceElement, subscription.title, true);
    }
  }

  var showPreview = prefs.previewimages && !("tooltip" in item);
  showPreview = showPreview && (item.typeDescr == "IMAGE" || item.typeDescr == "BACKGROUND");
  if (showPreview) {
    // Check whether image is in cache (stolen from ImgLikeOpera)
    if (!cacheSession) {
      var cacheService = Cc["@mozilla.org/network/cache-service;1"].getService(Ci.nsICacheService);
      cacheSession = cacheService.createSession("HTTP", Ci.nsICache.STORE_ANYWHERE, true);
    }

    try {
      var descriptor = cacheSession.openCacheEntry(item.location, Ci.nsICache.ACCESS_READ, false);
      descriptor.close();
    }
    catch (e) {
      showPreview = false;
    }
  }

  if (showPreview) {
    E("tooltipPreviewBox").hidden = false;
    E("tooltipPreview").setAttribute("src", "");
    E("tooltipPreview").setAttribute("src", item.location);
  }
  else
    E("tooltipPreviewBox").hidden = true;

  return true;
}

const visual = {
  OTHER: true,
  IMAGE: true,
  SUBDOCUMENT: true
}

/**
 * Updates context menu before it is shown.
 */
function fillInContext(/**Event*/ e)
{
  let item, allItems;
  if (treeView.data && !treeView.data.length)
  {
    item = treeView.getDummyTooltip();
    allItems = [item];
  }
  else
  {
    item = treeView.getItemAt(e.clientX, e.clientY);
    allItems = treeView.getAllSelectedItems();
  }

  if (!item || ("tooltip" in item && !("filter" in item)))
    return false;

  enableProxyOn(E('contextOpen'), aup.makeURL(item.location));

  E("contextCopyFilter").setAttribute("disabled", !allItems.some(function(item) {return "filter" in item && item.filter}));

  return true;
}

/**
 * Processed mouse clicks on the item list.
 * @param {Event} event
 */
function handleClick(event)
{
  let item = treeView.getItemAt(event.clientX, event.clientY);
  if (event.button == 0 && treeView.getColumnAt(event.clientX, event.clientY) == "state")
  {
    if (item.filter)
      enableFilter(item.filter, item.filter.disabled);
    event.preventDefault();
  }
  else if (event.button == 1)
  {
    openInTab(item);
    event.preventDefault();
  }
}

/**
 * Opens the item in a new tab.
 */
function openInTab(item)
{
  if (!item)
    item = treeView.getSelectedItem();
  if (!item)
    return;

  aup.loadInBrowser(item.location, mainWin);
}

function enableFilter(filter, enable) {
  if (!aup)
    return;

  filter.disabled = !enable;
  filterStorage.triggerFilterObservers(enable ? "enable" : "disable", [filter]);
  filterStorage.saveToDisk();

  treeView.boxObject.invalidate();
}

function copyToClipboard() {
  if (!aup)
    return;

  var items = treeView.getAllSelectedItems();
  if (!items.length)
    return;

  var clipboardHelper = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
  clipboardHelper.copyString(items.map(function(item) {return item.location}).join(aup.getLineBreak()));
}

function copyFilter() {
  if (!aup)
    return;

  var items = treeView.getAllSelectedItems().filter(function(item) {return item.filter});
  if (treeView.data && !treeView.data.length)
    items = [treeView.getDummyTooltip()];

  if (!items.length)
    return;

  var clipboardHelper = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
  clipboardHelper.copyString(items.map(function(item) {return item.filter.text}).join(aup.getLineBreak()));
}

function selectAll() {
  if (!aup)
    return;

  treeView.selectAll();
}

// Saves sidebar's state before detaching/reattaching
function saveState() {
  var focused = document.commandDispatcher.focusedElement;
  while (focused && (!focused.id || !("focus" in focused)))
    focused = focused.parentNode;

  // Calculate default position for the detached window
  var boxObject = document.documentElement.boxObject;
  var position = {screenX: boxObject.screenX, screenY: boxObject.screenY, width: boxObject.width, height: boxObject.height};

  var params = {
    filter: treeView.filter,
    focus: (focused ? focused.id : null),
    position: position
  };
  aup.setParams(params);
}

// closes the sidebar
function doClose()
{
  mainWin.document.getElementById("aup-command-sidebar").doCommand();
}

// detaches/reattaches the sidebar
function detach(doDetach)
{
  if (!aup)
    return;

  saveState();

  // Store variables locally, global variables will go away when we are closed
  let myPrefs = prefs;
  let myMainWin = mainWin;

  // Close sidebar and open detached window
  myMainWin.document.getElementById("aup-command-sidebar").doCommand();
  myPrefs.detachsidebar = doDetach;
  myMainWin.document.getElementById("aup-command-sidebar").doCommand();

  // Save setting
  myPrefs.save();
}

// Returns items size in the document if available
function getItemSize(item)
{
  if (item.filter && !item.filter.disabled && item.filter instanceof aup.BlockingFilter)
    return null;

  for each (let node in item.nodes)
  {
    if (node instanceof HTMLImageElement && (node.naturalWidth || node.naturalHeight))
      return [node.naturalWidth, node.naturalHeight];
    else if (node instanceof HTMLElement && (node.offsetWidth || node.offsetHeight))
      return [node.offsetWidth, node.offsetHeight];
  }
  return null;
}

// Sort functions for the item list
function sortByAddress(item1, item2) {
  if (item1.location < item2.location)
    return -1;
  else if (item1.location > item2.location)
    return 1;
  else
    return 0;
}

function sortByAddressDesc(item1, item2) {
  return -sortByAddress(item1, item2);
}

function compareType(item1, item2) {
  if (item1.localizedDescr < item2.localizedDescr)
    return -1;
  else if (item1.localizedDescr > item2.localizedDescr)
    return 1;
  else
    return 0;
}

function compareFilter(item1, item2) {
  var hasFilter1 = (item1.filter ? 1 : 0);
  var hasFilter2 = (item2.filter ? 1 : 0);
  if (hasFilter1 != hasFilter2)
    return hasFilter1 - hasFilter2;
  else if (hasFilter1 && item1.filter.text < item2.filter.text)
    return -1;
  else if (hasFilter1 && item1.filter.text > item2.filter.text)
    return 1;
  else
    return 0;
}

function compareState(item1, item2) {
  var state1 = (!item1.filter ? 0 : (item1.filter.disabled ? 1 : (item1.filter instanceof aup.WhitelistFilter ? 2 : 3)));
  var state2 = (!item2.filter ? 0 : (item2.filter.disabled ? 1 : (item2.filter instanceof aup.WhitelistFilter ? 2 : 3)));
  return state1 - state2;
}

function compareSize(item1, item2) {
  var size1 = getItemSize(item1);
  size1 = size1 ? size1[0] * size1[1] : 0;

  var size2 = getItemSize(item2);
  size2 = size2 ? size2[0] * size2[1] : 0;
  return size1 - size2;
}

function compareDocDomain(item1, item2)
{
  if (item1.docDomain < item2.docDomain)
    return -1;
  else if (item1.docDomain > item2.docDomain)
    return 1;
  else
    return 0;
}

function createSortWithFallback(cmpFunc, fallbackFunc, desc) {
  var factor = (desc ? -1 : 1);

  return function(item1, item2) {
    var ret = cmpFunc(item1, item2);
    if (ret == 0)
      return fallbackFunc(item1, item2);
    else
      return factor * ret;
  }
}

// Item list's tree view object
var treeView = {
  //
  // nsISupports implementation
  //

  QueryInterface: function(uuid) {
    if (!uuid.equals(Ci.nsISupports) &&
        !uuid.equals(Ci.nsITreeView))
    {
      throw Cr.NS_ERROR_NO_INTERFACE;
    }

    return this;
  },

  //
  // nsITreeView implementation
  //

  selection: null,

  setTree: function(boxObject) {
    if (!boxObject)
      return;

    this.boxObject = boxObject;
    this.itemsDummy = boxObject.treeBody.getAttribute("noitemslabel");

    var stringAtoms = ["col-address", "col-type", "col-filter", "col-state", "col-size", "col-docDomain", "state-regular", "state-filtered", "state-whitelisted", "state-hidden"];
    var boolAtoms = ["selected", "dummy", "filter-disabled"];
    var atomService = Cc["@mozilla.org/atom-service;1"].getService(Ci.nsIAtomService);

    this.atoms = {};
    for each (let atom in stringAtoms)
      this.atoms[atom] = atomService.getAtom(atom);
    for each (let atom in boolAtoms)
    {
      this.atoms[atom + "-true"] = atomService.getAtom(atom + "-true");
      this.atoms[atom + "-false"] = atomService.getAtom(atom + "-false");
    }

    this.itemsDummyTooltip = aup.getString("no_blocking_suggestions");

    // Check current sort direction
    var cols = document.getElementsByTagName("treecol");
    var sortDir = null;
    for (let i = 0; i < cols.length; i++) {
      var col = cols[i];
      var dir = col.getAttribute("sortDirection");
      if (dir && dir != "natural") {
        this.sortColumn = col;
        sortDir = dir;
      }
    }
    if (!this.sortColumn)
    {
      let defaultSort = E("list").getAttribute("defaultSort");
      if (/^(\w+)\s+(ascending|descending)$/.test(defaultSort))
      {
        this.sortColumn = E(RegExp.$1);
        if (this.sortColumn)
        {
          sortDir = RegExp.$2;
          this.sortColumn.setAttribute("sortDirection", sortDir);
        }
      }
    }

    if (sortDir)
    {
      this.sortProc = this.sortProcs[this.sortColumn.id + (sortDir == "descending" ? "Desc" : "")];
      E("list").setAttribute("defaultSort", " ");
    }

    // Make sure to update the dummy row every two seconds
    setInterval(function(view) {
      if (!view.data || !view.data.length)
        view.boxObject.invalidateRow(0);
    }, 2000, this);

    // Prevent a reference through closures
    boxObject = null;
  },

  get rowCount() {
    return (this.data && this.data.length ? this.data.length : 1);
  },

  getCellText: function(row, col) {
    col = col.id;

    if (col != "type" && col != "address" && col != "filter" && col != "size" && col != "docDomain")
      return "";

    if (this.data && this.data.length) {
      if (row >= this.data.length)
        return "";

      if (col == "type")
        return this.data[row].localizedDescr;
      else if (col == "filter")
        return (this.data[row].filter ? this.data[row].filter.text : "");
      else if (col == "size")
      {
        let size = getItemSize(this.data[row]);
        return (size ? size.join(" x ") : "");
      }
      else if (col == "docDomain")
        return this.data[row].docDomain;
      else
        return this.data[row].location;
    }
    else {
      // Empty list, show dummy
      if (row > 0 || (col != "address" && col != "filter"))
        return "";

      if (col == "filter") {
        return "";
      }

      return this.itemsDummy;
    }
  },
  
  generateProperties: function(list, properties)
  {
    if (properties)
    {
      // Gecko 21 and below: we have an nsISupportsArray parameter, add atoms
      // to that.
      for (let i = 0; i < list.length; i++)
        if (list[i] in this.atoms)
          properties.AppendElement(this.atoms[list[i]]);
      return null;
    }
    else
    {
      // Gecko 22+: no parameter, just return a string
      return list.join(" ");
    }
  },

  getColumnProperties: function(col, properties) {
    return this.generateProperties(["col-" + col.id], properties);
  },

  getRowProperties: function(row, properties) {
    if (row >= this.rowCount)
      return;

    let list = [];
    list.push("selected-" + this.selection.isSelected(row));

    var state;
    if (this.data && this.data.length) {
      list.push("dummy-false");

      let filter = this.data[row].filter;
      if (filter)
        list.push("filter-disabled-" + filter.disabled);

      state = "state-regular";
      if (filter && !filter.disabled)
      {
        if (filter instanceof aup.WhitelistFilter)
          state = "state-whitelisted";
        else if (filter instanceof aup.BlockingFilter)
          state = "state-filtered";
      }
    }
    else {
      list.push("dummy-true");

      state = "state-filtered";
    }
    list.push(state);
    return this.generateProperties(list, properties);
  },

  getCellProperties: function(row, col, properties)
  {
    return this.getRowProperties(row, properties) + " " + this.getColumnProperties(col, properties);
  },

  cycleHeader: function(col) {
    col = col.id;

    col = E(col);
    if (!col)
      return;

    var cycle = {
      natural: 'ascending',
      ascending: 'descending',
      descending: 'natural'
    };

    var curDirection = "natural";
    if (this.sortColumn == col)
      curDirection = col.getAttribute("sortDirection");
    else if (this.sortColumn)
      this.sortColumn.removeAttribute("sortDirection");

    curDirection = cycle[curDirection];

    if (curDirection == "natural")
      this.sortProc = null;
    else
      this.sortProc = this.sortProcs[col.id + (curDirection == "descending" ? "Desc" : "")];

    if (this.data)
      this.refilter();

    col.setAttribute("sortDirection", curDirection);
    this.sortColumn = col;

    this.boxObject.invalidate();
  },

  isSorted: function() {
    return this.sortProc;
  },

  isContainer: function() {return false},
  isContainerOpen: function() {return false},
  isContainerEmpty: function() {return false},
  getLevel: function() {return 0},
  getParentIndex: function() {return -1},
  hasNextSibling: function() {return false},
  toggleOpenState: function() {},
  canDrop: function() {return false},
  drop: function() {},
  getCellValue: function() {return null},
  getProgressMode: function() {return null},
  getImageSrc: function() {return null},
  isSeparator: function() {return false},
  isEditable: function() {return false},
  cycleCell: function() {},
  performAction: function() {},
  performActionOnRow: function() {},
  performActionOnCell: function() {},
  selectionChanged: function() {},

  //
  // Custom properties and methods
  //

  boxObject: null,
  atoms: null,
  filter: "",
  data: null,
  allData: [],
  sortColumn: null,
  sortProc: null,
  resortTimeout: null,
  itemsDummy: null,
  itemsDummyTooltip: null,

  sortProcs: {
    address: sortByAddress,
    addressDesc: sortByAddressDesc,
    type: createSortWithFallback(compareType, sortByAddress, false),
    typeDesc: createSortWithFallback(compareType, sortByAddress, true),
    filter: createSortWithFallback(compareFilter, sortByAddress, false),
    filterDesc: createSortWithFallback(compareFilter, sortByAddress, true),
    state: createSortWithFallback(compareState, sortByAddress, false),
    stateDesc: createSortWithFallback(compareState, sortByAddress, true),
    size: createSortWithFallback(compareSize, sortByAddress, false),
    sizeDesc: createSortWithFallback(compareSize, sortByAddress, true),
    docDomain: createSortWithFallback(compareDocDomain, sortByAddress, false),
    docDomainDesc: createSortWithFallback(compareDocDomain, sortByAddress, true)
  },

  setData: function(data) {
    var oldRows = this.rowCount;

    this.allData = data;
    for each (let item in this.allData)
    {
      if (!item.filter)
        item.filter = disabledWhitelistMatcher.matchesAny(item.location, item.typeDescr, item.docDomain, item.thirdParty);
      if (!item.filter)
        item.filter = disabledBlacklistMatcher.matchesAny(item.location, item.typeDescr, item.docDomain, item.thirdParty);
    }
    this.refilter();

    this.boxObject.rowCountChanged(0, -oldRows);
    this.boxObject.rowCountChanged(0, this.rowCount);
  },

  addItem: function(item) {
    this.allData.push(item);
    if (!item.filter)
      item.filter = disabledWhitelistMatcher.matchesAny(item.location, item.typeDescr, item.docDomain, item.thirdParty);
    if (!item.filter)
      item.filter = disabledBlacklistMatcher.matchesAny(item.location, item.typeDescr, item.docDomain, item.thirdParty);

    if (!this.matchesFilter(item))
      return;

    var index = -1;
    if (this.sortProc && this.sortColumn && this.sortColumn.id == "size")
    {
      // Sorting by size requires accessing content document, and that's
      // dangerous from a content policy (and we are likely called directly
      // from a content policy call). Size data will be inaccurate anyway,
      // delay sorting until later.
      if (this.resortTimeout)
        clearTimeout(this.resortTimeout);
      this.resortTimeout = setTimeout(function(me)
      {
        if (me.sortProc)
          me.data.sort(me.sortProc);
        me.boxObject.invalidate();
      }, 500, this);
    }
    else if (this.sortProc)
      for (var i = 0; index < 0 && i < this.data.length; i++)
        if (this.sortProc(item, this.data[i]) < 0)
          index = i;

    if (index >= 0)
      this.data.splice(index, 0, item);
    else {
      this.data.push(item);
      index = this.data.length - 1;
    }

    if (this.data.length == 1)
      this.boxObject.invalidateRow(0);
    else
      this.boxObject.rowCountChanged(index, 1);
  },

  /**
   * Updates the list after a filter or sorting change.
   */
  refilter: function()
  {
    if (this.resortTimeout)
      clearTimeout(this.resortTimeout);

    this.data = this.allData.filter(this.matchesFilter, this);

    if (this.sortProc)
      this.data.sort(this.sortProc);
  },

  /**
   * Tests whether an item matches current list filter.
   * @return {Boolean} true if the item should be shown
   */
  matchesFilter: function(item)
  {
    if (!this.filter)
      return true;

    return (item.location.toLowerCase().indexOf(this.filter) >= 0 ||
            (item.filter && item.filter.text.toLowerCase().indexOf(this.filter) >= 0) ||
            item.localizedDescr.toLowerCase().indexOf(this.filter) >= 0);
  },

  setFilter: function(filter) {
    var oldRows = this.rowCount;

    this.filter = filter.toLowerCase();
    this.refilter();

    var newRows = this.rowCount;
    if (oldRows != newRows)
      this.boxObject.rowCountChanged(oldRows < newRows ? oldRows : newRows, this.rowCount - oldRows);
    this.boxObject.invalidate();
  },

  selectAll: function() {
    this.selection.selectAll();
  },

  getSelectedItem: function() {
    if (!this.data || this.selection.currentIndex < 0 || this.selection.currentIndex >= this.data.length)
      return null;

    return this.data[this.selection.currentIndex];
  },

  getAllSelectedItems: function() {
    let result = [];
    if (!this.data)
      return result;

    let numRanges = this.selection.getRangeCount();
    for (let i = 0; i < numRanges; i++)
    {
      let min = {};
      let max = {};
      let range = this.selection.getRangeAt(i, min, max);
      for (let j = min.value; j <= max.value; j++)
      {
        if (j >= 0 && j < this.data.length)
          result.push(this.data[j]);
      }
    }
    return result;
  },

  getItemAt: function(x, y)
  {
    if (!this.data)
      return null;

    var row = this.boxObject.getRowAt(x, y);
    if (row < 0 || row >= this.data.length)
      return null;

    return this.data[row];
  },

  getColumnAt: function(x, y)
  {
    if (!this.data)
      return null;

    let col = {};
    this.boxObject.getCellAt(x, y, {}, col, {});
    if (col.value)
      return col.value.id;
  },

  getDummyTooltip: function() {
    if (!this.data || this.data.length)
      return null;

    return {tooltip: this.itemsDummyTooltip};
  },

  selectItem: function(item) {
    var row = -1;
    for (var i = 0; row < 0 && i < this.data.length; i++)
      if (this.data[i] == item)
        row = i;

    if (row < 0 )
      return;

    this.selection.select(row);
    this.boxObject.ensureRowIsVisible(row);
  }
}
