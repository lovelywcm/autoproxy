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
  var rows = document.getElementsByTagName('rows')[0],
  selectedItem = function(proxyValue)
  {
    return (parseInt(proxyValue) + proxy.server.length + 1) % (proxy.server.length + 1);
  };

  // menu list for setting default proxy
  menu.newList(E('defaultProxy'), prefs.defaultProxy, true);

  // one row per rule group
  for each (let subscription in filterStorage.subscriptions) {
    var group      = cE("row"),
        groupType  = cE("label"),
        groupTitle = cE("textbox");
    rows.insertBefore(group, E('groupSeparator'));

    group.appendChild(groupType);
    group.appendChild(groupTitle);
    groupType.setAttribute("value", subscription.typeDesc + ": ");
    groupTitle.setAttribute("value", subscription.title);

    menu.newList(group, selectedItem(subscription.proxy));
  }

  // row for setting fallback proxy
  menu.newList(E('fallbackProxy'), selectedItem(prefs.fallbackProxy));
}

var menu =
{
  menuList: null,

  /**
   * Create a menu list with several menu items:
   *   "direct connect" item
   *    ....
   *    several items according to how many proxy servers
   *    ...
   *   "default proxy" item
   *
   * @param node {DOM node}: which node should this new menu list append to
   * @param index {int}: which menu item should be selected by default
   * @param isDefaultProxyPopup {boolean}: if true, "default proxy" menu item won't be created
   */
  newList: function(node, index, isDefaultProxyPopup)
  {
    this.menuList = cE('menulist');
    this.menuList.appendChild(cE('menupopup'));
    node.appendChild(this.menuList);

    proxy.getName.forEach(this.newItem);

    if (isDefaultProxyPopup)
      this.menuList.firstChild.firstChild.hidden = true;
    else
      this.newItem('默认代理');

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
    filterStorage.subscriptions[j].title = textboxs[j].value;
  }

  var menus = document.getElementsByTagName("menulist");
  for (var i=0; i<menus.length; i++) {
    var selected = menus[i].selectedIndex;
    if (selected == proxy.server.length) { selected = -1; }

    if (i == 0) { prefs.defaultProxy = selected; }
    else if (i == menus.length - 1) { prefs.fallbackProxy = selected; }
    else {
      filterStorage.subscriptions[i-1].proxy = selected;
    }
  }

  prefs.save();
}
