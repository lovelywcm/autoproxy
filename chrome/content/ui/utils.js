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
 * 2009: Wang Congming <lovelywcm@gmail.com> modified for AutoProxy.
 *
 * ***** END LICENSE BLOCK ***** */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

const aup = Components.classes["@mozilla.org/autoproxy;1"].createInstance().wrappedJSObject;
const prefs = aup.prefs;
const policy = aup.policy;
const proxy = aup.proxy;
const filterStorage = aup.filterStorage;
const synchronizer = aup.synchronizer;

/**
 * Shortcut for document.getElementById(id)
 */
function E(id)
{
  return document.getElementById(id);
}

/**
 * Shortcut for document.createElementNS(element)
 */
function cE(elmt)
{
  return document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", elmt);
}
