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
 * Portions created by the Initial Developer are Copyright (C) 2009-2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK ***** */

function init()
{
  var rows = document.getElementsByTagName('rows')[0];

  // menu list for setting default proxy
  E('defaultProxy').firstChild.value = aup.getString('default_proxy');
  menu.newList(E('defaultProxy'), prefs.defaultProxy, true);

  // one row per rule group
  for each (let subscription in filterStorage.subscriptions) {
    var group      = cE("row"),
        groupType  = cE("label"),
        groupTitle = cE("textbox");
    rows.insertBefore(group, E('groupSeparator'));

    group.appendChild(groupType);
    group.appendChild(groupTitle);
    groupType.setAttribute("value", subscription.typeDesc);
    groupTitle.setAttribute("value", subscription.title || aup.getString("unnamed"));

    menu.newList(group, subscription.proxy + 1);
  }

  // if user has no rule group, insert a note
  if (E('groupSeparator').previousSibling.tagName == 'menuseparator') {
    var note = cE('label');
    note.setAttribute('disabled', true);
    note.setAttribute('value', aup.getString('no_proxy_rule'));
    E('groupSeparator').parentNode.insertBefore(note, E('groupSeparator'));
  }

  // row for setting fallback proxy
  E('fallbackProxy').firstChild.value = aup.getString('not_matching');
  menu.newList(E('fallbackProxy'),
    (prefs.fallbackProxy + proxy.server.length + 1) % (proxy.server.length + 1), "fallbackProxy");
}

var menu =
{
  menuList: null,

  /**
   * Create a menu list with several menu items:
   *   "default proxy" item
   *    ....
   *    several items according to how many proxy servers
   *
   * @param node {DOM node}: which node should this new menu list append to
   * @param index {int}: which menu item should be selected by default
   * @todo: @param isDefaultProxyPopup {boolean}: if true, "default proxy" menu item won't be created
   */
  newList: function(node, index, special)
  {
    this.menuList = cE('menulist');
    this.menuList.appendChild(cE('menupopup'));
    node.appendChild(this.menuList);

    if (!special)
      this.newItem(aup.getString('default_proxy'));

    proxy.getName.forEach(this.newItem);

    if (special == "fallbackProxy") {
      this.newItem(aup.getString('no_proxy'));
    }

    this.menuList.selectedIndex = index;
  },

  /**
   * Create a new menu item for this.menuList
   */
  newItem: function(proxyName)
  {
    var menuItem = cE('menuitem');
    menuItem.setAttribute('label', proxyName);
    menu.menuList.firstChild.appendChild(menuItem);
  }
};

function save()
{
  var textboxs = document.getElementsByTagName("textbox");
  for (var j=0; j<textboxs.length; j++) {
    filterStorage.subscriptions[j].title = (
      textboxs[j].value == aup.getString("unnamed") ? "" : textboxs[j].value);
  }

  var menus = document.getElementsByTagName("menulist");
  for (var i=0; i<menus.length; i++) {
    var selected = menus[i].selectedIndex;
    if (i == 0) {
      prefs.defaultProxy = selected;
      prefs.save();
    }
    else if (i == menus.length - 1) {
      prefs.fallbackProxy = selected == proxy.server.length ? -1 : selected;
      prefs.save();
    }
    else {
      filterStorage.subscriptions[i-1].proxy = selected - 1;
    }
  }
}
