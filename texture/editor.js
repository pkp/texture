(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('substance'), require('substance-texture')) :
  typeof define === 'function' && define.amd ? define(['substance', 'substance-texture'], factory) :
  (factory(global.substance,global.texture));
}(this, (function (substance,substanceTexture) { 'use strict';

  window.addEventListener('load', () => {
    substance.substanceGlobals.DEBUG_RENDERING = true;
    setTimeout(() => {
      let app = DevWebApp.mount({
        debug: true,
        archiveId: substance.getQueryStringParam('archive') || 'kitchen-sink',
        storageType: substance.getQueryStringParam('storage') || 'vfs',
        storageUrl: substance.getQueryStringParam('storageUrl') || '/archives'
      }, window.document.body);

      // put the archive and some more things into global scope, for debugging
      setTimeout(() => {
        window.app = app;
      }, 500);
    });
  });

  // This uses a monkey-patched VfsStorageClient that checks immediately
  // if the stored data could be loaded again, or if there is a bug in
  // Textures exporter
  class DevWebApp extends substanceTexture.TextureWebApp {
    _getStorage (storageType) {
      let storage = super._getStorage(storageType);
      if (storageType === 'vfs') {
        substanceTexture.vfsSaveHook(storage, substanceTexture.TextureArchive);
      }
      return storage
    }

    _getArticleConfig () {
      return substanceTexture.EditorPackage
    }
  }

})));

//# sourceMappingURL=./editor.js.map