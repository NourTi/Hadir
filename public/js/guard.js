if (location.protocol === 'file:') {
  document.body.innerHTML = '<div style="font:18px system-ui;max-width:560px;margin:12vh auto;padding:24px;line-height:1.6"><h2>Hadir must be started, not opened as a file</h2><p>Double-click <b>start.bat</b> (Windows) or run <b>npm start</b> in the platform folder, then open <b>http://localhost:3000</b>.</p></div>';
}
