(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('substance'), require('substance-texture')) :
        typeof define === 'function' && define.amd ? define(['substance', 'substance-texture'], factory) :
            (factory(global.substance, global.texture));
}(this, (function (substance, substanceTexture) {
    'use strict';

    window.addEventListener('load', () => {
        substance.substanceGlobals.DEBUG_RENDERING = substance.platform.devtools;
        setTimeout(() => {
            let props = {
                storageType: 'remote',
                storageUrl: document.querySelector('meta[name=jobId').getAttribute('content'),
                archiveId: ""
            }
            let app = OJSTextureEditor.mount(props, window.document.body);
            setTimeout(() => {
                window.app = app;
              }, 500);
        });
    });


    class OJSTextureEditor extends substanceTexture.TextureWebApp {
        save() {
            this.state.archive.save().then(() => {
                console.log('successfully saved');
            }).catch(err => {
                console.error(err);
            });
        }

        _getStorage(storageType) {
            let storage = super._getStorage(storageType);
            if (storageType === 'vfs') {
                substanceTexture.vfsSaveHook(storage, substanceTexture.TextureArchive);
            }
            return storage
        }

        _getArticleConfig() {
            return substanceTexture.EditorPackage
        }
    }

})));

//# sourceMappingURL=./editor.js.map
