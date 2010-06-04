window.onload = function() {
    var e = document.getElementById("connectionSettings");
    e.addEventListener("click", onConnectionSettings, false);
}
function onConnectionSettings(event) {
    if (prefs.proxyMode != "disabled") {
        aup.openSettingsDialog();
        event.preventDefault();
    }
}
