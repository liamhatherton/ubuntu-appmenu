//    ugappmenunx preferences

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ugappmenunxPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({ title: 'Appearance' });
        page.add(group);

        const desaturateRow = new Adw.SwitchRow({
            title: 'Desaturate app icon',
            subtitle: 'Show the app menu button icon in grayscale',
        });
        group.add(desaturateRow);

        settings.bind('desaturate-icon', desaturateRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        const symbolicRow = new Adw.SwitchRow({
            title: 'Symbolic app icon',
            subtitle: 'Use the app\'s monochrome symbolic icon when available',
        });
        group.add(symbolicRow);

        settings.bind('symbolic-icon', symbolicRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        const boldRow = new Adw.SwitchRow({
            title: 'Bold button text',
            subtitle: 'Show the app name on the top bar in bold',
        });
        group.add(boldRow);

        settings.bind('bold-label', boldRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        const distroRow = new Adw.SwitchRow({
            title: 'Show distro when no app is active',
            subtitle: 'Display the OS logo and name (e.g. Ubuntu 26.04.1 LTS) on an empty desktop',
        });
        group.add(distroRow);

        settings.bind('show-distro-when-idle', distroRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        const behaviorGroup = new Adw.PreferencesGroup({ title: 'Menu' });
        page.add(behaviorGroup);

        const alignRow = new Adw.SwitchRow({
            title: 'Align menu to left of button',
            subtitle: 'Line the dropdown up with the button\'s left edge instead of centring it',
        });
        behaviorGroup.add(alignRow);

        settings.bind('align-menu-left', alignRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        window._settings = settings;
    }
}
