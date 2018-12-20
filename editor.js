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
=======

			function _createImages () {
				substance.forEach(data.resources, (record, filePath) => {
					if (record.encoding === 'blob') {
						var binaries = new FileReader();
						binaries.onload = function (event) {
							substance.sendRequest({
								method: 'PUT',
								url,
								data: {
									'media': {
										'id': record.id,
										'fileName': filePath,
										'fileType': record.data.type,
										'originalFileName': record.data.name || filePath,
										'data': binaries.result,
									},
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

			function _deleteImage (op) {
				if (op.type === 'delete') {
					if (op.val) {
						if (op.val.type === 'graphic') {
							if (op.val.attributes) {
								var mimetype = op.val.attributes['mimetype'];
								if (mimetype === 'image') {
									var fileName = op.val.attributes['xlink:href'];
									if (fileName !== undefined) {
										substance.sendRequest({
											method: 'DELETE',
											url,
											data: {
												'fileName': fileName,
											},
										}).then(response => {
											cb(null, response);
										}).catch(err => {
											cb(err);
										});
									}
								}
							}
						}
					}
				}
			}

			function _deleteImages () {
				if (data) {
					if (data.diff) {
						if (data.diff) {
							var diffs = data.diff;
							if (diffs.length >= 1) {
								for (var i in diffs) {
									var change = diffs[i].change;
									if (change.ops) {
										for (var op of change.ops) {
											_deleteImage(op);
										}
									}
								}

							}
						}
					}
				}
			}

			_createImages();
			_deleteImages();

>>>>>>> master
		}

	}

	class OJSTextureEditor extends substanceTexture.TextureWebApp {
		_getStorage (storageType) {
<<<<<<< HEAD
			let storage = super._getStorage(storageType);
=======
			var storage = super._getStorage(storageType);
>>>>>>> master
			return new OJSTextureStorage(this.props.storageUrl);
		}
	}

})));

//# sourceMappingURL=./editor.js.map
