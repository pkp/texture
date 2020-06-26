<?php

/**
 * @file plugins/generic/texture/TexturePlugin.inc.php
 *
 * Copyright (c) 2003-2019 Simon Fraser University
 * Copyright (c) 2003-2019 John Willinsky
 * Distributed under the GNU GPL v2. For full terms see the file docs/COPYING.
 *
 * @class SubstancePlugin
 * @ingroup plugins_generic_texture
 *
 * @brief Substance JATS editor plugin
 *
 */

import('lib.pkp.classes.plugins.GenericPlugin');

define('DAR_MANIFEST_FILE', 'manifest.xml');
define('DAR_MANUSCRIPT_FILE', 'manuscript.xml');
define('TEXTURE_DAR_FILE_TYPE', 'dar');
define('TEXTURE_ZIP_FILE_TYPE', 'zip');
define('TEXTURE_HTML_FILE_TYPE', 'html');

/**
 * Class TexturePlugin
 */
class TexturePlugin extends GenericPlugin {
	/**
	 * @copydoc Plugin::getDisplayName()
	 */
	function getDisplayName() {

		return __('plugins.generic.texture.displayName');
	}

	/**
	 * @copydoc Plugin::getDescription()
	 */
	function getDescription() {

		return __('plugins.generic.texture.description');
	}

	/**
	 * @copydoc Plugin::register()
	 */
	function register($category, $path, $mainContextId = null) {

		if (parent::register($category, $path, $mainContextId)) {
			if ($this->getEnabled()) {
				// Register callbacks.
				HookRegistry::register('LoadHandler', array($this, 'callbackLoadHandler'));
				HookRegistry::register('TemplateManager::fetch', array($this, 'templateFetchCallback'));

				$this->_registerTemplateResource();
			}
			return true;
		}
		return false;
	}

	/**
	 * Get texture editor URL
	 * @param $request PKPRequest
	 * @return string
	 */
	function getTextureUrl($request) {

		return $this->getPluginUrl($request) . '/texture';
	}

	/**
	 * Get plugin URL
	 * @param $request PKPRequest
	 * @return string
	 */
	function getPluginUrl($request) {

		return $request->getBaseUrl() . '/' . $this->getPluginPath();
	}

	/**
	 * @param $hookName string The name of the invoked hook
	 * @param $args
	 * @return bool
	 * @see PKPPageRouter::route()
	 */
	public function callbackLoadHandler($hookName, $args) {

		$page = $args[0];
		$op = $args[1];

		switch ("$page/$op") {
			case 'texture/createGalley':
			case 'texture/editor':
			case 'texture/export':
			case 'texture/extract':
			case 'texture/json':
			case 'texture/save':
			case 'texture/createGalleyForm':
			case 'texture/media':
				define('HANDLER_CLASS', 'TextureHandler');
				define('TEXTURE_PLUGIN_NAME', $this->getName());
				$args[2] = $this->getPluginPath() . '/' . 'TextureHandler.inc.php';
				break;
		}

		return false;
	}

	/**
	 * Adds additional links to submission files grid row
	 * @param $hookName string The name of the invoked hook
	 * @param $params array Hook parameters
	 */
	public function templateFetchCallback($hookName, $params) {

		$request = $this->getRequest();
		$router = $request->getRouter();
		$dispatcher = $router->getDispatcher();

		$templateMgr = $params[0];
		$resourceName = $params[1];
		if ($resourceName == 'controllers/grid/gridRow.tpl') {
			$row = $templateMgr->getTemplateVars('row');
			$data = $row->getData();
			if (is_array($data) && (isset($data['submissionFile']))) {
				$submissionFile = $data['submissionFile'];
				$fileExtension = strtolower($submissionFile->getExtension());

				// get stage ID
				$stageId = (int)$request->getUserVar('stageId');
				$fileStage = SUBMISSION_FILE_PRODUCTION_READY;

				if (strtolower($fileExtension) == 'xml') {
					import('lib.pkp.classes.linkAction.request.OpenWindowAction');
					$this->_editWithTextureAction($row, $dispatcher, $request, $submissionFile, $stageId);
					$this->_createGalleyAction($row, $dispatcher, $request, $submissionFile, $stageId, $fileStage);
					$this->_exportAction($row, $dispatcher, $request, $submissionFile, $stageId, $fileStage);
				} elseif (strtolower($fileExtension) == TEXTURE_DAR_FILE_TYPE) {
					$this->_extractAction($row, $dispatcher, $request, $submissionFile, $stageId, $fileStage, TEXTURE_DAR_FILE_TYPE);
				} elseif (strtolower($fileExtension) == TEXTURE_ZIP_FILE_TYPE) {
					$this->_extractAction($row, $dispatcher, $request, $submissionFile, $stageId, $fileStage, TEXTURE_ZIP_FILE_TYPE);
				} elseif (strtolower($fileExtension) == TEXTURE_HTML_FILE_TYPE) {
					import('lib.pkp.classes.linkAction.request.OpenWindowAction');
					$this->_createGalleyAction($row, $dispatcher, $request, $submissionFile, $stageId, $fileStage);
				}
			}
		}
	}

	/**
	 * exports a dar archive
	 * @param $row SubmissionFilesGridRow
	 * @param Dispatcher $dispatcher
	 * @param PKPRequest $request
	 * @param $submissionFile SubmissionFile
	 * @param int $stageId
	 * @param int $fileStage
	 */
	private function _exportAction($row, Dispatcher $dispatcher, PKPRequest $request, $submissionFile, int $stageId, int $fileStage): void {

		$row->addAction(new LinkAction(
			'texture_export',
			new OpenWindowAction(
				$dispatcher->url($request, ROUTE_PAGE, null, 'texture', 'export', null,
					array(
						'submissionId' => $submissionFile->getSubmissionId(),
						'fileId' => $submissionFile->getFileId(),
						'stageId' => $stageId
					)
				)
			),
			__('plugins.generic.texture.links.exportDarArchive'),
			null
		));
	}

	/**
	 * extracts a dar archive
	 * @param $row SubmissionFilesGridRow
	 * @param Dispatcher $dispatcher
	 * @param PKPRequest $request
	 * @param $submissionFile SubmissionFile
	 * @param int $stageId
	 * @param int $fileStage
	 * @param $zipType
	 */
	private function _extractAction($row, Dispatcher $dispatcher, PKPRequest $request, $submissionFile, int $stageId, int $fileStage, $zipType): void {

		$stageId = (int)$request->getUserVar('stageId');
		$zipLabel = ($zipType == TEXTURE_DAR_FILE_TYPE) ? 'plugins.generic.texture.links.extractDarArchive' : 'plugins.generic.texture.links.extractZipArchive';

		$actionArgs = array(
			'submissionId' => $submissionFile->getSubmissionId(),
			'fileId' => $submissionFile->getFileId(),
			'stageId' => $stageId,
			'zipType' => $zipType
		);

		$path = $dispatcher->url($request, ROUTE_PAGE, null, 'texture', 'extract', null, $actionArgs);
		$pathRedirect = $dispatcher->url($request, ROUTE_PAGE, null, 'workflow', 'access', $actionArgs);
		import('lib.pkp.classes.linkAction.request.PostAndRedirectAction');
		$row->addAction(new LinkAction(
			'texture_import',
			new PostAndRedirectAction($path, $pathRedirect),
			__($zipLabel),
			null
		));
	}

	/**
	 * Adds edit with Texture action to files grid
	 * @param $row SubmissionFilesGridRow
	 * @param Dispatcher $dispatcher
	 * @param PKPRequest $request
	 * @param $submissionFile SubmissionFile
	 * @param int $stageId
	 */
	private function _editWithTextureAction($row, Dispatcher $dispatcher, PKPRequest $request, $submissionFile, int $stageId): void {

		$row->addAction(new LinkAction(
			'texture_editor',
			new OpenWindowAction(
				$dispatcher->url($request, ROUTE_PAGE, null, 'texture', 'editor', null,
					array(
						'submissionId' => $submissionFile->getSubmissionId(),
						'fileId' => $submissionFile->getFileId(),
						'stageId' => $stageId
					)
				)
			),
			__('plugins.generic.texture.links.editWithTexture'),
			null
		));
	}

	/**
	 * Adds create galley action to files grid
	 * @param $row SubmissionFilesGridRow
	 * @param Dispatcher $dispatcher
	 * @param PKPRequest $request
	 * @param $submissionFile SubmissionFile
	 * @param int $stageId
	 */
	private function _createGalleyAction($row, Dispatcher $dispatcher, PKPRequest $request, $submissionFile, int $stageId, int $fileStage): void {

		$actionArgs = array(
			'submissionId' => $submissionFile->getSubmissionId(),
			'stageId' => $stageId,
			'fileStage' => $fileStage,
			'fileId' => $submissionFile->getFileId()
		);
		$row->addAction(new LinkAction(
			'createGalleyForm',
			new AjaxModal(
				$dispatcher->url(
					$request, ROUTE_PAGE, null,
					'texture',
					'createGalleyForm', null,
					$actionArgs
				),
				__('submission.layout.newGalley')
			),
			__('plugins.generic.texture.links.createGalley'),
			null
		));

	}
}
