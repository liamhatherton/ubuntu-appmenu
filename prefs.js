//    AppMenuNX preferences

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class AppMenuNXPreferences extends ExtensionPreferences {
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

        window._settings = settings;
    }
}
