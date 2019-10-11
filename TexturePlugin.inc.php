<?php

/**
 * @file plugins/generic/texture/SubstancePlugin.inc.php
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
	 * @see PKPPageRouter::route()
	 */
	public function callbackLoadHandler($hookName, $args) {
		$page = $args[0];
		$op = $args[1];

		switch ("$page/$op") {
			case 'texture/editor':
			case 'texture/json':
			case 'texture/save':
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
	 * @param $args array Hook parameters
	 */
	public function templateFetchCallback($hookName, $params) {
		$request = $this->getRequest();
		$router = $request->getRouter();
		$dispatcher = $router->getDispatcher();
		$journal = $request->getJournal();
		$journalId = $journal->getId();

		$templateMgr = $params[0];
		$resourceName = $params[1];
		if ($resourceName == 'controllers/grid/gridRow.tpl') {
			$row = $templateMgr->getTemplateVars('row');
			$data = $row->getData();
			if (is_array($data) && (isset($data['submissionFile']))) {
				$submissionFile = $data['submissionFile'];
				$fileExtension = strtolower($submissionFile->getExtension());

				// get stage ID
				$submissionId = $submissionFile->getSubmissionId();
				$submissionDao = $submissionDao = Application::getSubmissionDAO();
				$submission = $submissionDao->getById($submissionId);
				$stageId = $submission->getStageId();

				if (strtolower($fileExtension) == 'xml') {
					import('lib.pkp.classes.linkAction.request.OpenWindowAction');
					$row->addAction(new LinkAction(
						'editor',
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
			}
		}
	}
}
