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
				archiveId: '',
			};
			let app = OJSTextureEditor.mount(props, window.document.body);
			setTimeout(() => {
				window.app = app;
			}, 500);
		});
	});

	class OJSTextureStorage extends substanceTexture.HttpStorageClient {
		write (archiveId, data, cb) {
			let url = this.apiUrl;
			if (archiveId) {
				url = url + '/' + archiveId;
			}
			console.log('data', data);
			substance.forEach(data.resources, (record, filePath) => {
				if (record.encoding === 'blob') {
					var binaries = new FileReader();
					binaries.onload = function (event) {
						substance.sendRequest({
							method: 'PUT',
							url,
							data: {
								"media": {
									"id": record.id,
									"fileName":filePath,
									"fileType":record.data.type,
									"originalFileName": record.data.name || filePath,
									"data": binaries.result
								}
							},
						}).then(response => {
							cb(null, response);
						}).catch(err => {
							cb(err);
						});

					};
					binaries.readAsDataURL(record.data);
				}
			});
			return substance.sendRequest({
				method: 'PUT',
				url,
				data: {'archive': data},
			}).then(response => {
				cb(null, response);
			}).catch(err => {
				cb(err);
			});
		}

	}

	class OJSTextureEditor extends substanceTexture.TextureWebApp {
		_getStorage (storageType) {
			let storage = super._getStorage(storageType);
			return new OJSTextureStorage(this.props.storageUrl);
		}
	}

})));

//# sourceMappingURL=./editor.js.map
