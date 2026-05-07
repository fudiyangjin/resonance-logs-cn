!macro NSIS_HOOK_PREINSTALL
  IfSilent done

  StrCpy $0 "$APPDATA\com.resonance-logs-global\locales"
  IfFileExists "$0\*.*" 0 done

  MessageBox MB_ICONEXCLAMATION|MB_YESNO "Resonance Logs has editable localization files in AppData.$\r$\n$\r$\nIf your UI/localization files are stale or broken, the installer can reset only this folder:$\r$\n$0$\r$\n$\r$\nThis does not delete logs, settings, history, or custom trigger data. Any manual edits inside the localization folder will be replaced when the app repairs it on next launch.$\r$\n$\r$\nReset the AppData localization folder now?" IDYES reset IDNO done

  reset:
    ClearErrors
    RMDir /r "$0"
    IfErrors 0 done
    MessageBox MB_ICONSTOP "The installer could not reset:$\r$\n$0$\r$\n$\r$\nClose Resonance Logs if it is running, then use Settings > Locales > Repair AppData Locale Folder after installation."

  done:
!macroend
