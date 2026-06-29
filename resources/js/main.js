/**
 * @file plugins/generic/docxConverter/resources/js/main.js
 *
 * Copyright (c) 2021-2025 TIB Hannover
 * Copyright (c) 2003-2025 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @ingroup plugins_generic_docxconverter
 *
 * @brief Vite main file
 */

pkp.registry.storeExtend(
	'fileManager_PRODUCTION_READY_FILES',
	(piniaContext) => {
		const dashboardStore = pkp.registry.getPiniaStore('dashboard');
		const fileStore = piniaContext.store;

		if (dashboardStore.dashboardPage !== 'editorialDashboard' || fileStore.props.submissionStageId !== pkp.const.WORKFLOW_STAGE_ID_PRODUCTION) {
			return;
		}

		const DAR_MANIFEST_FILE = 'manifest.xml';
		const DAR_MANUSCRIPT_FILE = 'manuscript.xml';
		const FILE_TYPE_DAR = 'dar';
		const FILE_TYPE_ZIP = 'zip';
		const FILE_TYPE_HTML = 'html';

		const {useModal} = pkp.modules.useModal;
		const {useLocalize} = pkp.modules.useLocalize;
		const {useUrl} = pkp.modules.useUrl;
		const {t, localize} = useLocalize();
		const {pageUrl} = useUrl('texture');

		fileStore.extender.extendFn('getItemActions', (itemActions, args) => {
			const localizedName = localize(args.file.name);
			if (localizedName.endsWith('.xml')) {
				const actions = [
					{
						label: t('plugins.generic.texture.links.editWithTexture'),
						name: 'editWithTexture',
						icon: 'FileText',
						actionFn: ({file}) => {
							window.open(`${pageUrl.value}/editor?submissionId=${file.submissionId}&submissionFileId=${file.id}&stageId=${file.fileStage}`);
						}
					}
				];
				return [...itemActions, ...actions];
			}
			return itemActions;
		});
	}
);
