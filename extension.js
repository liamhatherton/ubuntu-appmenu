//    ugappmenunx
//    GNOME Shell extension
//    @fthx 2025, based on GNOME Shell 48's panel.js AppMenuButton code
//    @liamhatherton 2026

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Animation from 'resource:///org/gnome/shell/ui/animation.js';
import { AppMenu } from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Overview from 'resource:///org/gnome/shell/ui/overview.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

//const PANEL_ICON_SIZE = 16;
const PANEL_ICON_SIZE = 24;
const APP_MENU_ICON_MARGIN = 0;

// Name and logo of the running OS, from /etc/os-release, e.g. "Ubuntu 26.04.1".
function getDistroInfo() {
    const get = key => GLib.get_os_info(key) ?? '';
    // PRETTY_NAME is the distro's own display name, e.g. "Ubuntu 26.04.1 LTS".
    // Fall back to NAME + VERSION_ID if it's missing.
    const name = get('NAME') || 'Linux';
    const versionId = get('VERSION_ID');
    const label = get('PRETTY_NAME') || (versionId ? `${name} ${versionId}` : name);

    const id = get('ID');
    const logoNames = [
        get('LOGO'),
        id && `${id}-logo`,
        id && `${id}-logo-icon`,
        'distributor-logo',
        'start-here',
    ].filter(Boolean);
    // Prefer any symbolic (monochrome) variant before the full-colour logos.
    const iconNames = [
        ...logoNames.map(n => `${n}-symbolic`),
        ...logoNames,
    ];

    return {
        label,
        gicon: Gio.ThemedIcon.new_from_names(iconNames),
    };
}

const AppMenuButton = GObject.registerClass({
    Signals: { 'changed': {} },
}, class AppMenuButton extends PanelMenu.Button {
    _init(settings) {
        super._init(0.0, null, true);

        this._settings = settings;

        this.accessible_role = Atk.Role.MENU;

        this._startingApps = [];
        this._distro = getDistroInfo();
        this._showingDistro = false;

        this._menuManager = Main.panel.menuManager;
        this._targetApp = null;

        let bin = new St.Bin({ name: 'appMenu' });
        this.add_child(bin);

        this.bind_property('reactive', this, 'can-focus', 0);
        this.reactive = false;

        this._container = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        bin.set_child(this._container);

        this._iconBox = new St.Bin({
            style_class: 'app-menu-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._iconEffect = new Clutter.DesaturateEffect();
        this._iconBox.add_effect(this._iconEffect);
        this._container.add_child(this._iconBox);

        this._syncDesaturation();
        this._settings.connectObject(
            'changed::desaturate-icon', this._syncDesaturation.bind(this),
            'changed::symbolic-icon', this._syncIconStyle.bind(this),
            'changed::bold-label', this._syncLabelStyle.bind(this),
            'changed::show-distro-when-idle', () => {
                this._showingDistro = false;
                this._sync();
            },
            'changed::align-menu-left', () => this.menu?._boxPointer?.queue_relayout(), this);

        this._label = new St.Label({
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._container.add_child(this._label);
        this._syncLabelStyle();

        // Stays visible in the Activities overview too.
        this._visible = true;
        Main.overview.connectObject(
            'hiding', this._sync.bind(this),
            'showing', this._sync.bind(this), this);

        let menu = new AppMenu(this);
        this._patchMenuPosition(menu);
        this.setMenu(menu);
        this._menuManager.addMenu(menu);

        Shell.WindowTracker.get_default().connectObject('notify::focus-app',
            this._focusAppChanged.bind(this), this);
        Shell.AppSystem.get_default().connectObject('app-state-changed',
            this._onAppStateChanged.bind(this), this);
        global.window_manager.connectObject('switch-workspace',
            this._sync.bind(this), this);

        this._sync();
    }

    fadeIn() {
        if (this._visible)
            return;

        this._visible = true;
        this.reactive = true;
        this.remove_all_transitions();
        this.ease({
            opacity: 255,
            duration: Overview.ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    fadeOut() {
        if (!this._visible)
            return;

        this._visible = false;
        this.reactive = false;
        this.remove_all_transitions();
        this.ease({
            opacity: 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            duration: Overview.ANIMATION_TIME,
        });
    }

    // AppMenu centres its popup under the button (arrow alignment 0.5), so a
    // menu wider than the button hangs off to the left. When enabled, shift the
    // popup so its left edge lines up with the button's left edge (right edge
    // in RTL), still kept inside the monitor's work area.
    _patchMenuPosition(menu) {
        const boxPointer = menu._boxPointer;
        const button = this;
        const origReposition = boxPointer._reposition;

        boxPointer._reposition = function (allocationBox) {
            origReposition.call(this, allocationBox);

            if (!button._settings?.get_boolean('align-menu-left'))
                return;
            if (this._arrowSide !== St.Side.TOP && this._arrowSide !== St.Side.BOTTOM)
                return;

            const [sourceX] = button.get_transformed_position();
            const [sourceWidth] = button.get_transformed_size();
            const [, , natWidth] = this.get_preferred_size();
            const padding = this.get_theme_node().get_length('-arrow-rise');
            const workArea = this._workArea;

            let x = this.text_direction === Clutter.TextDirection.RTL
                ? sourceX + sourceWidth - natWidth
                : sourceX;
            x = Math.max(x, workArea.x + padding);
            x = Math.min(x, workArea.x + workArea.width - (padding + natWidth));

            const [parentX] = this.get_parent().get_transformed_position();
            const currentX = parentX + allocationBox.x1;
            allocationBox.set_origin(
                Math.floor(allocationBox.x1 + (x - currentX)), allocationBox.y1);
        };
    }

    _syncLabelStyle() {
        // The distro name always uses normal weight; bold applies to app names.
        if (this._settings.get_boolean('bold-label') && !this._showingDistro)
            this._label.add_style_class_name('ugappmenunx-bold');
        else
            this._label.remove_style_class_name('ugappmenunx-bold');
    }

    _syncDesaturation() {
        this._iconEffect.enabled = this._settings.get_boolean('desaturate-icon');
    }

    _syncIcon(app) {
        const icon = app.create_icon_texture(PANEL_ICON_SIZE - APP_MENU_ICON_MARGIN);
        icon.set_style_class_name('app-menu-icon');
        this._iconBox.set_child(icon);
        this._syncIconStyle();
    }

    _showDistro() {
        const icon = new St.Icon({
            gicon: this._distro.gicon,
            icon_size: PANEL_ICON_SIZE - APP_MENU_ICON_MARGIN,
            style_class: 'app-menu-icon',
        });
        this._iconBox.set_child(icon);
        this._syncIconStyle();

        this._label.set_text(this._distro.label);
        this.set_accessible_name(this._distro.label);
    }

    _syncIconStyle() {
        const icon = this._iconBox.get_child();
        if (!icon)
            return;

        // The distro logo always prefers its symbolic variant.
        const symbolic = this._showingDistro ||
            this._settings.get_boolean('symbolic-icon');
        icon.set_style(`-st-icon-style: ${symbolic ? 'symbolic' : 'regular'};`);
    }

    _onAppStateChanged(appSys, app) {
        let state = app.state;
        if (state !== Shell.AppState.STARTING)
            this._startingApps = this._startingApps.filter(a => a !== app);
        else if (state === Shell.AppState.STARTING)
            this._startingApps.push(app);
        // For now just resync on all running state changes; this is mainly to handle
        // cases where the focused window's application changes without the focus
        // changing.  An example case is how we map OpenOffice.org based on the window
        // title which is a dynamic property.
        this._sync();
    }

    _focusAppChanged() {
        let tracker = Shell.WindowTracker.get_default();
        let focusedApp = tracker.focus_app;
        if (!focusedApp) {
            // If the app has just lost focus to the panel, pretend
            // nothing happened; otherwise you can't keynav to the
            // app menu.
            if (global.stage.key_focus != null)
                return;
        }
        this._sync();
    }

    _findTargetApp() {
        let workspaceManager = global.workspace_manager;
        let workspace = workspaceManager.get_active_workspace();
        let tracker = Shell.WindowTracker.get_default();
        let focusedApp = tracker.focus_app;
        if (focusedApp && focusedApp.is_on_workspace(workspace))
            return focusedApp;

        for (let i = 0; i < this._startingApps.length; i++) {
            if (this._startingApps[i].is_on_workspace(workspace))
                return this._startingApps[i];
        }

        return null;
    }

    _sync() {
        let targetApp = this._findTargetApp();

        const showDistro = this._settings.get_boolean('show-distro-when-idle');

        if (this._targetApp !== targetApp) {
            this._targetApp?.disconnectObject(this);

            this._targetApp = targetApp;

            if (this._targetApp) {
                this._targetApp.connectObject('notify::busy', this._sync.bind(this), this);
                this._label.set_text(this._targetApp.get_name());
                this.set_accessible_name(this._targetApp.get_name());

                this._syncIcon(this._targetApp);
                this._showingDistro = false;
                this._syncLabelStyle();
            }
        }

        // No focused app: fall back to the distro logo and name.
        if (!this._targetApp && showDistro && !this._showingDistro) {
            this._showingDistro = true;
            this._showDistro();
            this._syncLabelStyle();
        }

        let visible = this._targetApp != null || showDistro;
        if (visible)
            this.fadeIn();
        else
            this.fadeOut();

        let isBusy = this._targetApp != null &&
            (this._targetApp.get_state() === Shell.AppState.STARTING ||
                this._targetApp.get_busy());

        // The distro label has no menu, so it isn't clickable.
        this.reactive = visible && !isBusy && this._targetApp != null;

        this.menu.setApp(this._targetApp);
        this.emit('changed');
    }

    destroy() {
        this._targetApp?.disconnectObject(this);

        Main.overview.disconnectObject(this);
        Shell.WindowTracker.get_default().disconnectObject(this);
        Shell.AppSystem.get_default().disconnectObject(this);
        global.window_manager.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._settings = null;

        super.destroy();
    }
});

export default class ugappmenunxExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._appMenuButton = new AppMenuButton(this._settings);
        if (!Main.panel.statusArea['ugappmenunx-indicator'])
            Main.panel.addToStatusArea('ugappmenunx-indicator', this._appMenuButton, -1, 'left');
    }

    disable() {
        this._appMenuButton?.destroy();
        this._appMenuButton = null;
        this._settings = null;
    }
}
