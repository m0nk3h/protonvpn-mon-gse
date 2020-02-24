// Includes
const St        = imports.gi.St;
const Main      = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Lang      = imports.lang;
const GLib      = imports.gi.GLib;
const Mainloop  = imports.mainloop;
const ByteArray = imports.byteArray;    

// Commands to run
const CMD_VPNSTATUS  = "protonvpn status";
const CMD_CONNECT    = "sudo protonvpn c -f";
const CMD_DISCONNECT = "sudo protonvpn d";
// Menu display text
const MENU_CONNECT       = "Connect";
const MENU_DISCONNECT    = "Disconnect";
// How many refreshes the state is overridden for
const STATE_OVERRIDE_DURATION=10
// VPN states and associated config
let _states = {
    "Status:       Connected": { 
        "panelShowServer":true, // Indicates the panel text is built up with the country and ID of the VPN server
        "styleClass":"green",   // CSS class for panel button
        "canConnect":false,     // Connect menu item enabled true/false
        "canDisconnect":true,   // Disconnect menu item enabled true/false
        "refreshTimeout":30,    // Seconds to refresh when this is the status
        "clearsOverrideId":1    // Clears a status override with this ID
    },
    "Status:     Disconnected": { 
        "panelText":"UNPROTECTED",
        "styleClass":"red",
        "canConnect":true,
        "canDisconnect":false,
        "refreshTimeout":10,
        "clearsOverrideId":2
    },
    "ERROR": {
        "panelText":"ERROR",
        "styleClass":"red",
        "canConnect":true,
        "canDisconnect":true,
        "refreshTimeout":10
    }
};

// Extension, panel button, menu items, timeout
let _vpnIndicator, _panelLabel, _statusLabel, _connectMenuItem, _disconnectMenuItem, 
    _connectMenuItemClickId, _updateMenuLabel, _disconnectMenuItemClickId, _timeout, _menuItemClickId;

// State persistence
let _stateOverride, _stateOverrideCounter;

const VpnIndicator = new Lang.Class({
    Name: 'VpnIndicator',
    Extends: PanelMenu.Button,

    _init: function () {
        // Init the parent
        this.parent(0.0, "VPN Indicator", false);
    },


    enable () {
        // Create the button with label for the panel
        let button = new St.Bin({
            style_class: 'panel-button',
            reactive: true,
            can_focus: true,
            x_fill: true,
            y_fill: false,
            track_hover: true
        });
        _panelLabel = new St.Label();
        button.set_child(_panelLabel);

        // Create the menu items
        _statusLabel = new St.Label({ text: "Checking...", y_expand: true, style_class: "statuslabel" });
        _updateMenuLabel = new St.Label({ visible: false, style_class: "updatelabel" });

        // Add the menu items to the menu
        this.menu.box.add(_statusLabel);
        this.menu.box.add(_updateMenuLabel);

        // Add the button and a popup menu
        this.actor.add_actor(button);

        this._refresh();
    },

    _refresh () {
        // Stop the refreshes
        this._clearTimeout();        

        // Read the VPN status from the command line
        const [ok, standardOut, standardError, exitStatus] = GLib.spawn_command_line_sync(CMD_VPNSTATUS);

        // Convert Uint8Array object to string and split up the different messages
        const statusMessages = ByteArray.toString(standardOut).split('\n');
        const statusBlob = ByteArray.toString(standardOut);
        
        // Check to see if a new version is available and display message in menu if so
        const updateAvailableText = statusMessages[0].includes('new version')
            ? statusMessages.shift(1)
            : null;

        // Determine the correct state from the "Status: xxxx" line
        // TODO: use results from vpn command to give details of error
        let vpnStatus = _states[statusMessages[0]] || _states.ERROR;

        // If a state override is active, increment it and override the state if appropriate
        if (_stateOverride) {
            _stateOverrideCounter += 1;

            if (_stateOverrideCounter <= STATE_OVERRIDE_DURATION && vpnStatus.clearsOverrideId != _stateOverride.overrideId) {
                // State override still active
                vpnStatus = _stateOverride;
            } else {
                // State override expired or cleared by current state, remove it
                _stateOverride = undefined;
                _stateOverrideCounter = 0;
            }
        }

        // Update the menu and panel based on the current state
        // statusMessages used to just pass statusMessages[0]
        this._updateMenu(vpnStatus, statusBlob, updateAvailableText);
        this._updatePanel(vpnStatus, statusMessages);

        // Start the refreshes again
        this._setTimeout(vpnStatus.refreshTimeout);
    },

    _updateMenu (vpnStatus, statusText, updateAvailableText) {
        // Set the status text on the menu
        _statusLabel.text = statusText;
        
        if (updateAvailableText) {
            _updateMenuLabel.text = updateAvailableText;
            _updateMenuLabel.visible = true;
        } else {
            _updateMenuLabel.visible = false;;
        }

    },

    _updatePanel(vpnStatus, statusMessages) {
        let panelText;

        // If connected, build up the panel text based on the server location and number
        if (vpnStatus.panelShowServer) {
            let country = statusMessages[3].replace("Server:", "");
        //    let serverNumber = statusMessages[1].match(/\d+/);
            panelText  = country + "     ";
        }

        // Update the panel button
        _panelLabel.text = panelText || vpnStatus.panelText;
        _panelLabel.style_class = vpnStatus.styleClass;
    },

    _clearTimeout () {
        // Remove the refresh timer if active
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = undefined;
        }
    },

    _setTimeout (timeoutDuration) {
        // Refresh after an interval
        this._timeout = Mainloop.timeout_add_seconds(timeoutDuration, Lang.bind(this, this._refresh));
    },

    disable () {

        // Clear timeout and remove menu callback
        this._clearTimeout();
    },

    destroy () {
        // Call destroy on the parent
        this.parent();
    }
});


function init() {}

function enable() {
    // Init the indicator
    _vpnIndicator = new VpnIndicator();

    // Add the indicator to the status area of the panel
    if (!_vpnIndicator) _vpnIndicator = new VpnIndicator();
    _vpnIndicator.enable();
    Main.panel.addToStatusArea('vpn-indicator', _vpnIndicator);
}

function disable() {
    // Remove the indicator from the panel
    _vpnIndicator.disable();
    destroy();
}

function destroy () {
    _vpnIndicator.destroy();
}
