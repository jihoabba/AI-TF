const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desk', {
  navigate: (page) => ipcRenderer.send('navigate', page),
});
